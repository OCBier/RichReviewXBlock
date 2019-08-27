/* eslint-disable camelcase,no-unused-vars,prettier/prettier */
const https = require('https')

const express = require('express')
const passport = require('passport')
const router = express.Router()

const axios = require('axios')
const convert = require('xml-js')
const util = require('../util')
const js_utils = require('../lib/js_utils.js')
const _downloader = require('../controllers/_downloader')
const _pages = require('../controllers/_pages')
const support = require('../controllers/support')
const mygroups = require('../controllers/mygroups')
const account = require('../controllers/account')
const doc = require('../controllers/doc')
const upload = require('../controllers/upload')
const viewer = require('../controllers/viewer')
const dataviewer = require('../controllers/dataviewer')
const dbs = require('../controllers/dbs')
const resources = require('../controllers/resources')
const course = require('../controllers/course')
const bluemix_stt_auth = require('../controllers/bluemix_stt_auth')
// const lti                = require('../controllers/lti');
const pilotController = require('../controllers/pilotController')
const authController = require('../controllers/authController')
const env = require('../lib/env')

/*****************************/
/** routes for get requests **/
/*****************************/
router.get('', function(req, res) {
    console.log("AUTHTEST")
    if(req.session.authUser){
        res.redirect('/edu/dashboard')
    }
    else{
        res.render('_pages_about')
    }
})
router.get('/', function(req, res) {
    console.log("AUTHTEST")
    if(req.session.authUser){
        res.redirect('/edu/dashboard')
    }
    else{
        res.render('_pages_about')
    }
})
router.get('/about', _pages.about)
router.get('/logout_saml', authController.isLoggedIn, authController.samlLogout)
router.get('/logout', authController.isLoggedIn, authController.logout)
router.get('/input_test', _pages.input_test)
router.get('/admin', _pages.admin)
router.get('/downloader', _downloader.dn)
router.get('/support', support.get)
router.get('/mydocs', authController.isLoggedIn, doc.get)
router.get('/mygroups', mygroups.get)
router.get('/upload', authController.isLoggedIn, upload.page)
router.get('/viewer', viewer.page)
router.get('/dataviewer', dataviewer.get)
router.get('/account', authController.isLoggedIn, account.get)
router.get('/resources', resources.get)
// router.get('/math2220_sp2016', authController.isLoggedIn, course.get)
router.get('/bluemix_stt_auth', bluemix_stt_auth.get)
// router.get('/lti_entry',       lti.get_entry);
// router.get('/lti_failure',     lti.get_failure);
// router.get('/lti_admin',       authController.isLoggedIn, lti.get_admin);
// router.get('/lti_survey',      lti.get_survey);
// router.get('/lti_observe',     lti.get_observe);
// router.get('/lti_discuss_rr',  lti.get_discuss_rr);
// router.get('/lti_discuss_bb',  lti.get_discuss_bb);
router.get('/synclog', _pages.getSyncLog)

/******************************/
/** routes for post requests **/
/******************************/
router.post('/dbs', dbs.post)
router.post('/account', account.post)
router.post('/dataviewer', dataviewer.post)
router.post('/upload', upload.post)
router.post('/support', support.post)
router.post('/resources', resources.post)
// router.post('/course', course.post)
// router.post('/lti_dbs',    lti.post_dbs);
// router.post('/lti_survey', lti.post_survey);
// router.post('/lti_discuss_bb', lti.post_bb);

/****************************/
/** routes for pilot study **/
/****************************/
router.get(
  '/login_pilot',
  authController.isNotLoggedIn,
  pilotController.pilot_login_page
)
router.get(
  '/pilot_admin',
  authController.isLoggedIn,
  pilotController.auth_pilot_admin,
  pilotController.pilot_admin
)
router.post(
  '/pilot_admin/mgmt_acct/:email',
  authController.isLoggedIn,
  pilotController.auth_pilot_admin,
  pilotController.mgmt_acct
)

/****************************/
/** routes for MyClass app **/
/****************************/

// TODO: turn into general backdoor; finish route
// note there are no post req set up yet so is just view
router.get(
  '/pilot_backdoor',
  authController.isLoggedIn,
  // TODO: should auth is super-user
  pilotController.pilot_backdoor
)

// TODO: finish route
router.get('/class', authController.isLoggedIn, pilotController.class_page)

/**
 * redirections
 */
router.get('/math2220', function(req, res) {
  res.redirect('/math2220_sp2016')
})

router.get('/demo', function(req, res) {
  res.redirect('/demo0')
})

router.get('/demo0', function(req, res) {
  res.redirect(
    '/viewer?access_code=7bf0f0add24f13dda0c0a64da0f45a0a6909809e'
  )
})

router.get('/demo1', function(req, res) {
  res.redirect('/viewer?access_code=dd6372ae2e677aa6a0bb7a9ff239094fd48ac6c7')
})

router.get('/demo2', function(req, res) {
  res.redirect('/viewer?access_code=ecff389d8486935ae7f3835c8420377c015a43b8')
})

/**
 * auth
 */
router.get(
  '/login_ubc',
  authController.isNotLoggedIn,
  passport.authenticate('saml', {
    failureRedirect: '/login_ubc',
    failureFlash: true
  }),
  function(req, res) {
    res.redirect(req.session.latestUrl || '/')
  }
)

router.post(
  '/login_ubc_return',
  passport.authenticate('saml', {
    failureRedirect: '/login_ubc',
    failureFlash: true
  }),
  async function(req, res) {
    js_utils.logUserAction(req, 'logged in')

    const xml = Buffer.from(req.body.SAMLResponse, 'base64').toString('ascii')
    const user_xml_json = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 4 }))
    const attributes = user_xml_json['saml2p:Response']['saml2:Assertion']['saml2:AttributeStatement']['saml2:Attribute']

    const user_data = {}

    for (const attribute of attributes) {
      if (attribute._attributes.Name === 'urn:oid:2.16.840.1.113719.1.1.4.1.25') {
        let courses = [];
        try {
          for (const course of attribute['saml2:AttributeValue']) {
            courses.push(course._text)
          }
        } catch(e) {
          courses = attribute['saml2:AttributeValue']._text
        }
        user_data['urn:oid:2.16.840.1.113719.1.1.4.1.25'] = courses;
      } else {
        user_data[attribute._attributes.Name] = attribute['saml2:AttributeValue']._text
      }
    }

    user_data['urn:oid:0.9.2342.19200300.100.1.1'] = `ubc_${user_data['urn:oid:0.9.2342.19200300.100.1.1']}`

    req.session.authUser = { id: user_data['urn:oid:0.9.2342.19200300.100.1.1'] }

    await axios.post(
      `https://${env.node_config.BACKEND}:3000/login`,
      {
        user_data: user_data,
        auth_type: 'UBC_CWL'
      },
      {
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      }
    )

    res.redirect('/edu/dashboard')
    // res.redirect(req.session.latestUrl || '/')
  }
)

router.get(
  '/login_cornell',
  authController.isNotLoggedIn,
  passport.authenticate('wsfed-saml2', {
    failureRedirect: '/login_cornell',
    failureFlash: true
  }),
  function(req, res) {
    res.redirect(req.session.latestUrl || '/')
  }
)
router.post(
  '/login_cornell_return',
  passport.authenticate('wsfed-saml2', {
    failureRedirect: '/login_cornell',
    failureFlash: true
  }),
  function(req, res) {
    js_utils.logUserAction(req, 'logged in')
    res.redirect(req.session.latestUrl || '/')
  }
)

router.get(
  '/login_google',
  authController.isNotLoggedIn,
  passport.authenticate('google', { scope: ['email'] })
)

// TODO: now OAth2 callback needs to be reached through a GET command instead of a POST command. Why?
router.get(
  '/login-oauth2-return',
  passport.authenticate('google', { failureRedirect: '/login_google' }),
  async function(req, res) {
    const user_data = req.user;
    console.log(user_data)
    req.session.authUser = { id: user_data.id }

    await axios.post(
      `https://${env.node_config.BACKEND}:3000/login`,
      {
        user_data: user_data,
        auth_type: 'Google'
      },
      {
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      }
    )

    js_utils.logUserAction(req, 'logged in')
    res.redirect('/edu/dashboard')
    // res.redirect(req.session.latestUrl || '/')
  }
)

router.post(
  '/login_pilot',
  passport.authenticate('local', {
    failureRedirect: '/login_pilot',
    failureFlash: 'You failed to login',
    successFlash: 'You are logged in'
  }),
  function(req, res) {
    js_utils.logUserAction(req, 'logged in')
    res.redirect(req.session.latestUrl || '/')
  }
)
module.exports = router
