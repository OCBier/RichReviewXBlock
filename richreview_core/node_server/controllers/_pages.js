﻿var env = require('../lib/env');
var js_utils = require('../lib/js_utils');
/*
 * GET home page.
 */

exports.about = function (req, res) {
    req.session.latestUrl = req.originalUrl;
    res.render('_pages_about', {cur_page: 'About', user: req.user });
};

exports.input_test = function(req, res){
    req.session.latestUrl = req.originalUrl;
    res.render("input_test", {user: req.user});
};

exports.admin = function(req, res){
    req.session.latestUrl = req.originalUrl;
    try{
        if(env.admin_list.indexOf(req.user.id) > -1){
            res.render('_pages_admin', {user: req.user, access: 'admin'});
        }
    }
    catch(err){
        res.render('_pages_admin', {user: req.user, access: 'user'});
    }
};

exports.getSyncLog = function(req, res){
    js_utils.logUserAction(req, "SyncLog/"+req.query.what);
    res.send(200);
};
