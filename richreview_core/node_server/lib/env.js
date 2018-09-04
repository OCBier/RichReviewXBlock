/**
 * Created by dongwookyoon on 6/16/15.
 */

// import built-in modules
const fs = require('fs');
const path = require('path');

// import libraries
const util     = require('../util');
const file_utils = require('../lib/file_utils');

util.start("importing env");

// NOTE: Deprecated
exports.EMAIL_USER_LOOKUP = "email_user_lookup";

exports.USERID_EMAIL_TABLE = "userid_email_table";

// constants for authentication types
const AUTH_TYPE = {
  UBC_CWL: "UBC_CWL",
  INTERNAL: "Internal",
  PILOT: "Pilot",
  CORNELL: "Cornell",
  GOOGLE: "Google",
  OTHER: "other",
  UNKN: "unknown"
};
exports.AUTH_TYPE = AUTH_TYPE;

// The list of recognized authentication types to compare with
exports.AUTH_TYPES = [
  AUTH_TYPE.UBC_CWL,
  AUTH_TYPE.INTERNAL,
  AUTH_TYPE.PILOT,
  AUTH_TYPE.CORNELL,
  AUTH_TYPE.GOOGLE
];

/**
 * UBC constants
 */
const UBC = {
  CWL: {
    ATTRIBUTE: {
      // uid - CWL login name of the account holder authenticating.
      uid: "urn:oid:0.9.2342.19200300.100.1.1",
      // mail - email address of account holder. The value is derived from following sources (in order of precedence): HR business email address, SIS email address, Email address entered when registering for CWL account
      mail: "urn:oid:0.9.2342.19200300.100.1.3",
      // displayName is the preferred name of the CWL user
      displayName: "urn:oid:2.16.840.1.113730.3.1.241",
      // givenName - first name of UBC Student, UBC Faculty, UBC Staff, Guest, Basic CWL account holders.
      givenName: "urn:oid:2.5.4.42",
      // sn - the last name, aka surname, of UBC Student, UBC Faculty, UBC Staff, Guest, Basic CWL account holders.
      sn: "urn:oid:2.5.4.4",
      // user's student number
      ubcEduStudentNumber: "urn:mace:dir:attribute-def:ubcEduStudentNumber",
      // ubcEduPersistentID - the UBC Persistent Identifier; unique per User, per Service. Deactivation available if Security incidence arises for generation of new value.
      ubcEduPersistentID: "urn:oid:1.3.6.1.4.1.60.1.7.1",
      // groupMembership - ELDAP group memberships for groupOfUniqueName groups.
      groupMembership: "urn:oid:2.16.840.1.113719.1.1.4.1.25",
      // group attributes
      GROUP: {
        CHIN_141_002_2018W_INSTRUCTOR: "chin_141_002_2018w_instructor",
        CHIN_141_002_2018W: "chin_141_002_2018w",
        KORN_102_001_2018W_INSTRUCTOR: "korn_102_001_2018w_instructor",
        KORN_102_001_2018W: "korn_102_001_2018w"
      }
    }
  }
};

/**
 * Index to contain all course groups
 */
const COURSE_GROUP = {
  CHIN_141_002_2018W: UBC.CWL.ATTRIBUTE.GROUP.CHIN_141_002_2018W,
  KORN_102_001_2018W: UBC.CWL.ATTRIBUTE.GROUP.KORN_102_001_2018W
};

exports.UBC = UBC;
exports.COURSE_GROUP = COURSE_GROUP;

/**
 * List of course group to compare
 * @type {Array}
 */
exports.COURSE_GROUPS = (() => {
  return Object.keys(COURSE_GROUP).map(k => { return COURSE_GROUP[k]; });
});

// Constants for (university) institutions
exports.INSTITUTION = {
  UBC: "UBC",
  CORNELL: "Cornell"
};

exports.admin_list = [
    '116730002901619859123'
];

/**
 * path of the webapps
 */
exports.path = {
    'temp_pdfs': '/tmp/richreview/pdfs',
    'webapp_richreview': 'webapps/richreview',
    'webapp_multicolumn': 'webapps/multicolumn'
};

/**
 * make webapp urls
 */
exports.webapp_urls = {
    'multicolumn': file_utils.getWebAppUrls(
        'webapps/multicolumn',
        '/static_multicolumn/',
        /((\/|^)\..*)/
    ),
    'richreview': file_utils.getWebAppUrls(
        'webapps/richreview',
        '/static_viewer/',
        /((\/|^)\..*)|(^test\/.*)/
    )
};

exports.config_files = {
    bluemix_stt_auth: path.join(__dirname, '..', 'ssl/bluemix_stt_auth.json')
};

exports.node_config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'ssl/node_config.json'), 'utf-8')
);

exports.azure_config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'ssl/azure_config.json'), 'utf-8')
);

exports.google_oauth = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'ssl/google_open_id.json'), 'utf-8')
);

exports.cornell_wsfed = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'ssl/cornell_wsfed.json'), 'utf-8')
);

exports.sha1_salt = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'ssl/sha1_salt.json'), 'utf-8')
);

exports.redis_config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'ssl/redis_config.json'), 'utf-8')
);

exports.ssl_key = fs.readFileSync(path.join(__dirname, '..', 'ssl/richreview_net.key'));
exports.ssl_cert = fs.readFileSync(path.join(__dirname, '..', 'ssl/richreview_net.crt'));
exports.ssl_ca = fs.readFileSync(path.join(__dirname, '..', 'ssl/root.crt'));

exports.ubc = {
    idp_config: JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'ssl/ubc_idp_config.json'), 'utf-8')
    ),
    privateCert: fs.readFileSync(path.join(__dirname, '..', 'ssl/sp_richreview_ubc.cert'), 'utf-8'),
    decryptionPvk: fs.readFileSync(path.join(__dirname, '..', 'ssl/sp_richreview_ubc.key'), 'utf-8')
};