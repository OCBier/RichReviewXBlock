/* eslint-disable camelcase */
import Vue from 'vue'
import Router from 'vue-router'

import login from './pages/login'
import authentication from './pages/authentication'
import dashboard from './pages/dashboard'
import course from './pages/course'
import assignment from './pages/assignment'
import people from './pages/people'
import course_groups from './pages/course_groups'
import course_group from './pages/course_group'
import edit_assignment from './pages/edit_assignment'
import new_assignment from './pages/new_assignment'
import grades from './pages/grades'
import new_course_group from './pages/new_course_group'
import assignment_submissions from './pages/assignment_submissions'
import viewer from './pages/viewer'
import grader from './pages/grader'
import deleted_assignments from './pages/deleted_assignments'
import all_user_assignments from './pages/all_user_assignments'
import all_user_groups from './pages/all_user_groups'
import all_user_grades from './pages/all_user_grades'

Vue.use(Router)

export function createRouter() {
  return new Router({
    mode: 'history',
    routes: [
      {
        path: '/education/login',
        component: login
      },
      {
        path: '/education',
        component: login
      },
      {
        path: '/education/authentication',
        component: authentication
      },
      {
        path: '/education/dashboard',
        component: dashboard
      },
      {
        path: '/education/all-assignments',
        component: all_user_assignments
      },
      {
        path: '/education/all-groups',
        component: all_user_groups
      },
      {
        path: '/education/all-grades',
        component: all_user_grades
      },
      {
        path: '/education/courses/:course_id',
        component: course
      },
      {
        path: '/education/courses/:course_id/assignments/new',
        component: new_assignment
      },
      {
        path: '/education/courses/:course_id/deleted-assignments',
        component: deleted_assignments
      },
      {
        path: '/education/courses/:course_id/assignments/:assignment_id',
        component: assignment
      },
      {
        path: '/education/courses/:course_id/users',
        component: people
      },
      {
        path: '/education/courses/:course_id/course_groups',
        component: course_groups
      },
      {
        path: '/education/courses/:course_id/course_groups/new',
        component: new_course_group
      },
      {
        path: '/education/courses/:course_id/course_groups/:group_id',
        component: course_group
      },
      {
        path: '/education/courses/:course_id/assignments/:assignment_id/edit',
        component: edit_assignment
      },
      {
        path: '/education/courses/:course_id/grades',
        component: grades
      },
      {
        path:
          '/education/courses/:course_id/assignments/:assignment_id/submissions',
        component: assignment_submissions
      },
      {
        path: '/education/courses/:course_id/viewer',
        component: viewer
      },
      {
        path:
          '/education/courses/:course_id/assignments/:assignment_id/submissions/:submission_id/grader',
        component: grader
      }
    ]
  })
}
