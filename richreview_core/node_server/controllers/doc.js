/**
 * Created by dongwook on 9/22/15.
 */

var js_error = require("../lib/js_error");
var azure = require("../lib/azure");
var js_utils = require("../lib/js_utils");

exports.get = function(req, res){
    req.session.latestUrl = req.originalUrl;
    res.render('doc', {
            cur_page: "mydocs",
            user: req.user,
            BLOB_HOST: azure.BLOB_HOST,
            HOST: process.env.HOST_URL + "/",
            user_data: encodeURIComponent(JSON.stringify(req.user))
        }
    );
};