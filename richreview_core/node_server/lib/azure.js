/**
 * Set azure storage setting
 *
 */

// import built-in modules
const fs = require('fs');

// import npm modules
const Promise = require("promise");
const nconf = require('nconf');
const storage = require('azure-storage');
const request = require('request');
const tedious = require('tedious');

// import libraries
var env = require('../lib/env');

// set module variables
var BLOB_HOST = 'https://richreview.blob.core.windows.net/';
var ACCOUNT = 'richreview';

nconf.env().file({ file: env.config_files.azure_keys });

var sql_key_tedious = nconf.get("sql_key_tedious");
var blob_storage_key = nconf.get("blob_storage_key");

if( typeof sql_key_tedious === 'undefined' ||  typeof blob_storage_key === 'undefined' ){
    throw new Error('auth configuration file not found : ' + env.config_files.azure_keys);
}

var blob_svc = storage.createBlobService(ACCOUNT, blob_storage_key, BLOB_HOST).withFilter(new storage.ExponentialRetryPolicyFilter());

var ConnectionTD = tedious.Connection;
var RequestTD = tedious.Request;

exports.getSas = function(container, blob, expiry){ // expires in seconds
    // helpful links:
    // http://www.contentmaster.com/azure/windows-azure-storage-cors/
    // https://azure.microsoft.com/en-us/documentation/articles/storage-nodejs-how-to-use-blob-storage/#work-with-shared-access-signatures
    var t_start = new Date();
    var t_expiry = new Date(t_start);
    t_expiry.setSeconds(t_start.getSeconds() + expiry);
    t_start.setSeconds(t_start.getSeconds() - expiry);

    var policy = {
        AccessPolicy:{
            Permissions: storage.BlobUtilities.SharedAccessPermissions.WRITE,
            Expiry: t_expiry
        }
    };

    var sas = blob_svc.generateSharedAccessSignature(container, blob, policy);
    return sas;
};

exports.BlobFileDownload = function(c, b, f, cb){
    var wr = fs.createWriteStream(f);
    wr.on('finish', function(error){
        if(error){error_result = error;}
        wr.close(cb);
    });
    wr.on('error', function(error){
        error_result = error;
        wr.close(cb);
    });

    var rd = request.get(BLOB_HOST + c + '/' + b, function (error) {
        if(error){
            error_result = error;
            wr.close(cb);
        }
    });
    rd.on('error', function(error){
            if(error){error_result = error;}
        });
    rd.pipe(wr);
};

exports.svc = blob_svc;
exports.BLOB_HOST = BLOB_HOST;
exports.sqlQuery = function(cmd, callback){
    var sqlconn = new ConnectionTD(sql_key_tedious);
    sqlconn.on('connect', function(error) {
            if(error){
                console.log('Error from sqlconn.on');
                console.log(error);
                callback(error);
            }
            else{
                var result = [];
                sqlreq = new RequestTD(cmd, function(err, rowCount) {
                    if (error) {
                        console.log('Error from RequestTD');
                        console.log(error);
                        callback(error);
                    } else {
                        callback(error, result);
                    }
                    sqlconn.close();
                });

                sqlreq.on('row', function(columns) {
                    var r = {};
                    for(var i = 0; i < columns.length; ++i){
                        r[columns[i].metadata.colName] = columns[i].value;
                    }
                    result.push(r);
                });

                sqlconn.execSql(sqlreq);
            }
        }
    );
};

exports.CreateContainerIfNotExist = function(ctx){
    console.log("DEBUG azure.js CreateContainerIfNotExist");
    return new Promise(function(resolve, reject){
        blob_svc.createContainerIfNotExists(
            ctx.container,
            { publicAccessLevel : 'blob' },
            function(err, result){
                if(err){
                    reject(err);
                }
                else{
                    resolve(ctx)
                }
            }
        );
    });
};

exports.DoesBlobExist = function(ctx){
    console.log("DEBUG azure.js DoesBlobExist");
    return new Promise(function(resolve, reject){
        blob_svc.doesBlobExist(ctx.container, ctx.blob, function(err, resp){
            if(err){
                reject(err)
            }
            else{
                ctx.is_blob_exist = resp;
                resolve(ctx);
            }
        });
    });
};

exports.GetBlobToText = function(ctx){
    return new Promise(function(resolve, reject){
        blob_svc.getBlobToText(ctx.container, ctx.blob, function(err, resp){
            if(err){
                reject(err)
            }
            else{
                ctx.text = resp;
                resolve(ctx);
            }
        });
    });
};

exports.SetBlobFromText = function(ctx){
    return new Promise(function(resolve, reject){
        blob_svc.createBlockBlobFromText(ctx.container, ctx.blob, ctx.text, function(err, resp){
            if(err){
                reject(err)
            }
            else{
                ctx.resp = resp;
                resolve(ctx);
            }
        });
    });
};

/**
 *
 *
 * TODO: promisify blob_svc.createBlockBlobFromLocalFile
 */
exports.CreateBlobFromLocalFile = function(ctx) {
    /*
    // TODO: test and remove commented code
    return new Promise(function(resolve, reject){
        if(ctx.is_blob_exist){
            console.log("DEBUG: CRITICAL ctx.is_blob_exist=true");
            resolve(ctx);
        }
        else{
            console.log("DEBUG: CRITICAL ctx.is_blob_exist=false");
            blob_svc.createBlockBlobFromLocalFile(
                ctx.container,
                ctx.blob,
                ctx.blob_localfile_path,
                function(err){
                    if(err) { reject(err); }
                    else { resolve(ctx); }
                }
            );
        }
    });
    */
    console.log("DEBUG: azure.js CreateBlobFromLocalFile");
    return new Promise(function(resolve, reject) {
            console.log("DEBUG: svc.CreateBlobFromLocalFile");
            blob_svc.createBlockBlobFromLocalFile(
                ctx.container,
                ctx.blob,
                ctx.blob_localfile_path,
                function (err) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(ctx);
                    }
                }
            );
        })
};


exports.ListBlobsWithPrefix = function(container, prefix){
    return new Promise(function(resolve, reject){
        blob_svc.listBlobsSegmentedWithPrefix(container, prefix, undefined, function(err, resp){
            if(err){
                reject(err);
            }
            else{
                resolve(resp.entries.map(function(entity){return BLOB_HOST+'data/'+entity.name;}));
            }
        });

    })
};