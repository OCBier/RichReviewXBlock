/**
 * Created by yoon on 8/12/16.
 */

var Promise = require("promise");
var js_utils = require('../lib/js_utils.js');
var request = require("request"); // for LTI grading passback
var OAuth = require('oauth-1.0a'); // for LTI grading passback
var crypto = require('crypto'); // for LTI grading passback
var RedisClient = require('../lib/redis_client').RedisClient;
var AsyncLock = require('async-lock');
var lock = new AsyncLock();

var Status = (function(){
    var pub = {};
    pub.populated = {user: false, group: false};
    pub.ready = function(){
        "use strict";
        return pub.populated.user && pub.populated.group;
    };
    return pub;
}());

var User = function(id, data){
    this.id = id;
    if(data) {
        for (var k in data) {
            this[k] = data[k];
        }
    }
};

var UserMgr = (function(){
    var pub = {};

    var cache = {}; // id to LtiUser obj

    // get user by id (not including 'ltiusr')
    pub.getById = function(id){
        return assertId(id);
    };

    pub.getByIdSync = function(id){
        return cache[id];
    };

    pub.delById= function(id){
        return assertId(id)
            .then(function(user){
                delete cache[id];
                return RedisClient.DEL('ltiusr:'+id);
            });
    };

    pub.setAttr = function(id, name, val, json_type){
        return lock.acquire('setUserAttr', function() { // lock
            return RedisClient.HSET(
                'ltiusr:'+id,
                name,
                json_type === true ? JSON.stringify(val) : val
            )
                .then(
                    function(){
                        cache[id][name] = val;
                        return cache[id];
                    }
                );
        }, {Promise:Promise});
    };

    pub.loadAllFromDb = function(){
        return RedisClient.KEYS('ltiusr:*').then(
            function(ids_str){
                return Promise.all(
                    ids_str.map(function(id_str){
                        return loadFromDb(id_str.substring(7));
                    })
                );
            }
        )
    };

    pub.logIn = function(profile){
        if(!Status.ready()){ return Promise.reject(new Error('System is booting up. Retry in 1 min.'));}
        if(typeof profile === 'object' && typeof profile.user_id === 'string'){
            return (profile.user_id in cache ? Promise.resolve(cache[profile.user_id]) : createNew(profile))
                .then(function(user){
                    return updateProfile(user, profile);
                });
        }
        else{
            return new Promise.reject(new Error('Invalid LTI authentication profile'));
        }
    };

    function assertId(id){
        if(id in cache){
            return Promise.resolve(cache[id]);
        }
        else{
            return Promise.reject(new Error('Invalid User Id'));
        }
    }

    function createNew(lti){
        return RedisClient.HMSET(
            'ltiusr:'+lti.user_id,
            'nick', lti.lis_person_sourcedid,
            'email', lti.lis_person_contact_email_primary,
            'status', 'init',
            'group', '',
            'grade', 'wait_sub',
            'survey_resp', ''
        ).then(
            function(){
                return loadFromDb(lti.user_id);
            }
        )
    }

    function loadFromDb(id){
        return RedisClient.HGETALL('ltiusr:'+id).then(
            function(result){
                var usr = new User(id, result);
                cache[id] = usr;
                return usr;
            }
        )
    }

    function populateCache(){
        return pub.loadAllFromDb().then(
            function(users){
                console.log('LTI_ENGINE: users populated : ' + Object.keys(cache).length + '');
                return users;
            }
        );
    }

    function updateProfile(user, profile){
        var complete_profile = user.hasOwnProperty('lis_result_sourcedid') && user.hasOwnProperty('lis_outcome_service_url');
        if(!complete_profile || user.lis_result_sourcedid !== profile.lis_result_sourcedid){
            user.lis_result_sourcedid = profile.lis_result_sourcedid;
            user.lis_outcome_service_url = profile.lis_outcome_service_url;
            return RedisClient.HMSET(
                'ltiusr:'+user.id,
                'lis_result_sourcedid', profile.lis_result_sourcedid,
                'lis_outcome_service_url', profile.lis_outcome_service_url
            ).then(done);
        }
        return done();

        function done(){
            return Promise.resolve(user);
        }
    }

    populateCache().then(function(){
        Status.populated.user = true;
    });

    return pub;
})();

var Group = function(id, data){
    this.id = id;
    if(data)
        for( var k in data ){
            this[k] = data[k];
        }
};

const GRP_SIZE = 8;

var GroupMgr = function(prefix){
    var prefix = prefix;
    var cache = {};
    var next_grp_id = null; // without prefix

    this.assignUserIfNotSet = function(user){
        if(user.group === ''){ // if not set
            return lock.acquire('assignUserIfNotSet', function(){ // lock
                return getAvailableGroup(user)
                    .then(function(grp){
                        return assignUserToGroup(user, grp);
                        });
            }, {Promise:Promise});
        }
        else{ // if set
            return new Promise.resolve(cache[user.group]);
        }
    };

    this.getByIdSync = function(id){
        if(cache.hasOwnProperty(id)){
            return cache[id];
        }
        throw new Error('Invalid Group Id');
    };

    this.delById = function(id){
        if(next_grp_id === id){
            next_grp_id = null;
        }
        delete cache[id];
        return RedisClient.DEL(prefix+id);
    };

    this.delUserById = function(user_id, group_id){
        var group = this.getByIdSync(group_id);
        group.users.splice(group.users.indexOf(user_id), 1);
        return this.setAttr(group_id, 'users', group.users, true);
    };

    this.setAttr = function(id, name, val, json_type){
        return lock.acquire('setGroupAttr'+prefix, function() { // lock
            return RedisClient.HSET(
                prefix+id,
                name,
                json_type === true ? JSON.stringify(val) : val
            )
                .then(
                    function(){
                        cache[id][name] = val;
                        return cache[id];
                    }
                );
        }, {Promise:Promise});
    };

    function getAvailableGroup(user){
        if(next_grp_id === null){ // need to create a new group
            return createNewGroup(user)
                .then(function(grp){
                    next_grp_id = grp.id;
                    return Promise.resolve(grp);
                });
        }
        else{
            var grp = cache[next_grp_id];
            if(grp.users.length >= GRP_SIZE-1){
                next_grp_id = null;
            }
            return Promise.resolve(grp);
        }
    }

    function setNextGrpId(){
        for(var key in cache){
            if(cache[key].users.length < GRP_SIZE){
                next_grp_id = key;
                console.log('LTI_ENGINE: next group id:', key);
                break;
            }
        }
    }

    function createNewGroup(){
        var t = new Date();
        var grp_id = Object.keys(cache).length + '_' + t.getTime();
        return RedisClient.HMSET(
            prefix+grp_id,
            'creationTime', t.toISOString(),
            'users', '[]'
        ).then(
            function(){
                return loadFromDb(grp_id);
            }
        )
    }

    var assignUserToGroup = function (user, grp) {
        return UserMgr.setAttr(user.id, 'group', grp.id)
            .then(function(){
                grp.users.push(user.id);
                return this.setAttr(
                    grp.id,
                    'users',
                    grp.users,
                    true // json type
                )
            }.bind(this));
    }.bind(this);

    this.loadAllFromDb = function(){
        return RedisClient.KEYS(prefix+'*').then(
            function(ids_str){
                return Promise.all(
                    ids_str.map(function(id_str){
                        return loadFromDb(id_str.substring(prefix.length));
                    })
                );
            }
        )
    };

    var loadFromDb = function(id){
        return RedisClient.HGETALL(prefix+id).then(
            function(result){
                var grp = new Group(id, result);
                grp.users = JSON.parse(grp.users);
                cache[id] = grp;
                return grp;
            }
        )
    };

    var populateCache = function(){
        return this.loadAllFromDb().then(
            function(grps){
                console.log('LTI_ENGINE: groups populated: '+prefix + ' ' + Object.keys(cache).length + '');
                return grps;
            }
        );
    }.bind(this);

    populateCache().then(function(){
        setNextGrpId();
        Status.populated.group = true;
    });
};

var ListDb = function(_prefix){
    var prefix = _prefix;

    this.pushBack= function(id, cmdStr){
        return RedisClient.RPUSH(prefix+id, cmdStr);
    };

    this.getAfter = function(id, n){ // get n+1 th to the last item
        return RedisClient.LRANGE(prefix+id, n, -1);
    };
};

var logs = function(group_n, logs){
    var promises = logs.map(function(log){
        return RedisClient.RPUSH('ltilog:'+group_n, log);
    });
    return Promise.all(promises);
};

var Grade = (function(){
    var pub = {};

    pub.giveCredit = function(user){
        return LtiRecordScore(user.lis_outcome_service_url, user.lis_result_sourcedid);
    };


    function LtiRecordScore(lis_outcome_service_url, lis_result_sourcedid){
        var EDX_LTI_CONSUMER_OAUTH = {
            key: 'xh0rSz5O03-richreview.cornellx.edu',
            secret: 'sel0Luv73Q'
        };
        var oauth = OAuth({
            consumer: {
                key: EDX_LTI_CONSUMER_OAUTH.key,
                secret: EDX_LTI_CONSUMER_OAUTH.secret
            },
            signature_method: 'HMAC-SHA1',
            hash_function: function(base_string, key) {
                return crypto.createHmac('sha1', key).update(base_string).digest('base64');
            }
        });

        var xml = '<?xml version = "1.0" encoding = "UTF-8"?><imsx_POXEnvelopeRequest xmlns = "http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0"><imsx_POXHeader><imsx_POXRequestHeaderInfo><imsx_version>V1.0</imsx_version><imsx_messageIdentifier>'+
            'update_richreview_grade'+ // nonce
            '</imsx_messageIdentifier></imsx_POXRequestHeaderInfo></imsx_POXHeader><imsx_POXBody><replaceResultRequest><resultRecord><sourcedGUID><sourcedId>'+
            lis_result_sourcedid+
            '</sourcedId></sourcedGUID><result><resultScore><language>en-us</language><textString>'+
            '1'+
            '</textString></resultScore></result></resultRecord></replaceResultRequest></imsx_POXBody></imsx_POXEnvelopeRequest>';

        var request_data = {
            url: lis_outcome_service_url,//.replace('https', 'http'),
            method: 'POST',
            data: xml
        };
        var header = oauth.toHeader(oauth.authorize(request_data));

        return new Promise(function(resolve, reject){
            request({
                url: lis_outcome_service_url,
                method: request_data.method,
                form: xml,
                headers: header
            }, function(error, response, body) {
                if(error){
                    reject(error);
                }
                else{
                    if(body.indexOf('is now 1.0') >= 0){
                        resolve(body);
                    }
                    else{
                        reject(body);
                    }
                }
            });
        });
    }

    return pub;
}());

exports.logs = logs;
exports.CmdRR = new ListDb('lticmd_rr:');
exports.CmdBB = new ListDb('lticmd_bb:');
exports.GroupMgrRR = new GroupMgr('ltigrp_rr:');
exports.GroupMgrBB = new GroupMgr('ltigrp_bb:');
exports.User = User;
exports.UserMgr = UserMgr;
exports.Grade = Grade;
