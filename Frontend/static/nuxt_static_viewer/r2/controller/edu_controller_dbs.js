/**
 * Created by yoon on 12/21/14.
 */

const r2Sync = (function() {
  'use strict'

  const pub = {}

  const my_cmds = {} // my own commands will be tracked and ignored on download.

  var downloader_run = false;

  pub.loop = function() {
    pub.uploader.loop()
    if(!downloader_run){
      pub.downloader.runOnce()
      downloader_run = true;
    }
    //pub.downloader.loop()
  }

  pub.downloader = (function() {
    const pub_dn = {}
    let n_cmds = 0
    let timestamp = 0

    let busy = false

    pub_dn.runOnce = function(){
      var downloadTemplateComments = function(){
        if(r2.ctx.template_group_cmd){
          return r2.util
              .postDownloadCmds({
                groupid_n: r2.ctx.template_group_cmd.substr(4),
                groupid: "grp:"+r2.ctx.template_group_cmd.substr(4),
                cmds_downloaded_n: 0,
                cur_members_n: 0
              })
              .then(function(resp){
                if(resp.cmds && resp.cmds.length !== 0){
                  return processDownloadedCmds(resp.cmds);
                }
                else{
                  return Promise.resolve(null);
                }
              })
        }
        else{
          return Promise.resolve(null);
        }
      }

      var downloadNonTemplateComments = function(){
        return r2.util
            .postDownloadCmds({
              groupid_n: r2.ctx.groupid,
              groupid: 'grp:' + r2.ctx.groupid,
              cmds_downloaded_n: 0,
              cur_members_n: 0
            })
            .then(function(resp) {
              if (resp.cmds && resp.cmds.length !== 0) {
                return processDownloadedCmds(resp.cmds)
              }
              return Promise.resolve(null)
            })
      }

      downloadTemplateComments()
          .then(downloadNonTemplateComments)
          .catch(function(err) {
            console.error(err, err.stack)
            err.custom_msg =
                'We failed to download data from the server. Please check your internet connection and retry.'
            r2App.asyncErr.throw(err)
          })

    }

    pub_dn.loop = function() {
      if (r2App.cur_time - timestamp > r2Const.DB_SYNC_POLLING_INTERVAL) {
        download()
        timestamp = r2App.cur_time
      }
    }

    var download = function() {
      if (busy) {
        return
      }
      busy = true
      r2.util
        .postDownloadCmds({
          groupid_n: r2.ctx.groupid,
          groupid: 'grp:' + r2.ctx.groupid,
          cmds_downloaded_n: n_cmds,
          cur_members_n: r2.userGroup.GetCurMemberUsersNum()
        })
        .then(function(resp) {
          if (resp.group_update) {
            //r2.util.addEduInstructors(myself, users);
            //r2.userGroup.Set(resp.group_update)
          }
          if (resp.cmds && resp.cmds.length !== 0) {
            return processDownloadedCmds(resp.cmds)
          }
          return Promise.resolve(null)
        })
        .catch(function(err) {
          console.error(err, err.stack)
          err.custom_msg =
            'We failed to download data from legacy. Please check your internet connection and retry.'
          r2App.asyncErr.throw(err)
        })
        .then(function() {
          //busy = false
          busy = true; // one time download.
        })
    }

    pub_dn.processPrerecordedCommands = function(cmds) {
      busy = true
      return processDownloadedCmds(cmds)
        .catch(function(err) {
          console.error(err, err.stack)
          err.custom_msg =
            'We failed to download data from legacy. Please check your internet connection and retry.'
          r2App.asyncErr.throw(err)
        })
        .then(function() {
          busy = false
        })
    }

    var processDownloadedCmds = function(cmds) {
      return new Promise(function(resolve, reject) {
        r2.commentHistory.clearCommentHistory()
        cmds.sort(r2.util.chronologicalSort)
        var job = function(i) {
          setTimeout(function() {
            if (i !== cmds.length) {
              if (!(cmds[i].user + '_' + cmds[i].time in my_cmds)) {
                if (r2.cmd.executeCmd(r2App.doc, cmds[i], false)) {
                  r2.commentHistory.consumeCmd(cmds[i])
                } else {
                  console.error(
                    'Skipped an invalid cmd : ' + JSON.stringify(cmds[i])
                  )
                }
                $('#main_progress_bar').progressbar({
                  value: parseInt((100 * i) / (cmds.length - 1))
                })
              }
              job(i + 1)
            } else {
              resolve()
            }
          }, r2Const.TIMEOUT_MINIMAL)
        }
        job(0)
      })
    }

    return pub_dn
  })()

  pub.uploader = (function() {
    const pub_up = {}
    let q = []
    let busy = false

    pub_up.loop = function() {
      if (q.length > 0 && !busy) {
        if (r2.userGroup.cur_user.isguest) {
          // the guest user doesn't upload anything
          q = []
        } else {
          uploadAndConsumeCmds()
        }
      }
    }

    pub_up.busy = function() {
      return busy || q.length != 0
    }

    pub_up.pushCmd = function(cmd) {
      if (cmd.op === 'CreateComment' && cmd.type === 'CommentAudio') {
        var upload_audio_cmd = {}
        upload_audio_cmd.op = 'UploadAudio'
        upload_audio_cmd.aid = cmd.data.aid
        upload_audio_cmd.cmd_to_update = cmd
        q.push(upload_audio_cmd)
      } else if (
        cmd.op === 'ChangeProperty' &&
        cmd.type === 'PieceNewSpeakNewBaseAnnot'
      ) {
        var upload_audio_cmd = {}
        upload_audio_cmd.op = 'UploadAudio'
        upload_audio_cmd.aid = cmd.data.annot.data.aid
        upload_audio_cmd.cmd_to_update = cmd.data.annot
        q.push(upload_audio_cmd)
      }
      q.push(cmd)
      r2.commentHistory.consumeCmd(cmd)
    }

    const uploadCmd = function(cmd) {
      if (cmd.op === 'UploadAudio') {
        return uploadAudioBlob(cmd.aid, cmd.cmd_to_update)
      } else {
        return r2.util
          .uploadCmd({
            groupid_n: r2.ctx.groupid,
            cmd: JSON.stringify(cmd)
          })
          .then(function() {
            my_cmds[cmd.user + '_' + cmd.time] = true
            return null
          })
      }
    }

    var uploadAndConsumeCmds = function() {
      $('#uploading_indicator').toggleClass('show', true)
      busy = true
      const cmd_to_upload = q.shift()

      r2.util
        .retryPromise(
          uploadCmd(cmd_to_upload),
          r2Const.INTERVAL_CMD_UPLOAD_RETRY,
          r2Const.N_CMD_UPLOAD_RETRY
        )
        .then(function() {
          busy = false
          setTimeout(function() {
            if (!busy) {
              $('#uploading_indicator').toggleClass('show', false)
            }
          }, 500) // show the indicator for minimum 0.5 sec
        })
        .catch(function(_err) {
          q.unshift(cmd_to_upload)
          console.error(_err, _err.stack)
          const err = new Error('')
          err.custom_msg =
            'We failed to sync data with legacy. Please check your internet connection and retry, otherwise you may lose your comments.'
          r2App.asyncErr.throw(err)
        })
    }

    var uploadAudioBlob = function(aid, cmd_to_update) {
      const annot = r2App.annots[aid]
      return r2.util
        .getUploadSas({
          fname: annot.GetUsername() + '_' + annot.GetId()
        })
        .then(function(resp) {
          return r2.util.putBlobWithSas(
            resp.url,
            resp.sas,
            annot.GetRecordingAudioBlob()
          )
        })
        .then(function(url) {
          cmd_to_update.data.audiofileurl = url
          return null
        })
    }

    return pub_up
  })()

  return pub
})()
