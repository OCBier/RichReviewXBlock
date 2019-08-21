const RedisClient = require("./RedisClient");
const AsyncRedisClient = require("./AsyncRedisClient");
const RedisToJSONParser = require("./RedisToJSONParser");
const RichReviewError = require('../errors/RichReviewError');
const KeyDictionary = require('./KeyDictionary');

class CourseDatabaseHandler {

    constructor(){
        console.log(RedisClient);
        RedisClient.get_instance().then((db_handler) => {
            this.db_handler = db_handler;
        });
        AsyncRedisClient.get_instance().then((handler) => {
            this.async_db_handler = handler;
        });
    }



    static async get_instance() {
        if (this.instance) {
            console.log('Database handler instance found');
            return this.instance;
        }

        this.instance = await new CourseDatabaseHandler();
        return this.instance;
    }



    async get_user_courses_for_dashboard (import_handler, user_key) {
        let user_courses = await this.get_user_courses(import_handler, user_key);
        user_courses['enrolments'] = user_courses['enrolments'].map(course => {
            return {
                id: course.id,
                title: course.title,
                description: course.description,
                assignment_count: course.assignments.length
            }
        });
        user_courses['taing'] = user_courses['taing'].map(course => {
            return {
                id: course.id,
                title: course.title,
                description: course.description,
                assignment_count: course.assignments.length
            }
        });
        user_courses['teaching'] = user_courses['teaching'].map(course => {
            return {
                id: course.id,
                title: course.title,
                description: course.description,
                assignment_count: course.assignments.length
            }
        });

        return user_courses;
    }



    async get_user_courses (import_handler, user_key) {

        let user_db_handler = await import_handler.user_db_handler;

        if (!(await user_db_handler.is_valid_user_key(user_key)))
            throw new RichReviewError('Invalid user key');

        let assignment_db_handler = await import_handler.assignment_db_handler;

        let course_data = {};

        let course_ids = await this.get_course_ids(user_key);
        course_data['enrolments'] = await this.get_user_course_enrolments(import_handler, user_key, course_ids.enrolments);
        course_data['taing'] = await this.get_user_course_taings(user_key, course_ids.taing);
        course_data['teaching'] = await this.get_user_course_teachings(user_key, course_ids.teaching);
        course_data['assignments'] = await assignment_db_handler.get_all_users_upcoming_assignments(import_handler, user_key);

        return course_data;
    }



    async get_course_active_student_keys (course_key) {
        let course_data = await this.get_course_data(course_key);
        return course_data['active_students'];
    }


    async get_course_active_students (import_handler, course_key) {
        let user_db_handler = await import_handler.user_db_handler;

        let student_keys = await this.get_course_active_student_keys(course_key);
        let students = [];
        for (let user_key of student_keys) {
            let user_data = await user_db_handler.get_user_data(user_key);
            students.push({ key: user_key, name: user_data['display_name'] });
        }

        return students;
    }



    async get_course_course_groups_keys (course_key) {
        let course_data = await this.get_course_data(course_key);
        return course_data['active_course_groups'];
    }



    async get_course_course_groups (import_handler, course_key) {
        let course_group_db_handler = await import_handler.course_group_db_handler;

        let course_group_keys = await this.get_course_course_groups_keys(course_key);
        let course_groups = [];
        for (let course_group_key of course_group_keys) {
            let course_group_data = await course_group_db_handler.get_course_group_data(course_group_key);
            course_groups.push({ key: course_group_key, name: course_group_data['name'] });
        }

        return course_groups;
    }

    async get_all_course_data (){
        let course_keys = await this.async_db_handler.client.keys("crs:*");
        let course_data = [];
        for(const course_key of course_keys){
            course_data.push(await this.async_db_handler.client.hgetall(course_key));
        }
        return course_data;
    }

    async get_course (import_handler, user_key, course_key) {

        let assignment_db_handler = await import_handler.assignment_db_handler;
        let user_db_handler = await import_handler.user_db_handler;
        let course_group_db_handler = await import_handler.course_group_db_handler;

        let permissions = await user_db_handler.get_user_course_permissions(user_key, course_key);

        let course_data = await this.get_course_data(course_key);

        let assignments = [];

        if (permissions === 'student')
            assignments = await assignment_db_handler.get_course_assignments_for_student(
                import_handler,
                user_key,
                course_data['assignments']);
        else
            assignments = await assignment_db_handler.get_course_assignments_for_tas_and_instructors(
                import_handler,
                user_key,
                course_data['assignments']);


        const ret_course_data = { id: course_data.id, title: course_data.title, description: course_data.description};

        if (permissions === 'instructor' || permissions === 'ta') {
            ret_course_data['course_group_sets'] = await Promise.all(course_data['course_group_sets'].map(async course_group_set => {
                let course_group_set_data = await course_group_db_handler.get_course_group_set_data(course_group_set);
                course_group_set_data['key'] = course_group_set;
                return course_group_set_data;
            }));
        }


        return { course: ret_course_data, assignments: assignments };
    }



    async get_deleted_course_assignments (import_handler, user_key, course_key) {

        let assignment_db_handler = await import_handler.assignment_db_handler;

        let course_data = await this.get_course_data(course_key);

        let assignments = await assignment_db_handler.get_course_assignments(
            import_handler,
            user_key,
            course_data['deleted_assignments']);

        return { course: course_data, assignments: assignments };
    }



    async add_assignment_to_course (assignment_key, course_key) {

        let course_data = await this.get_course_data(course_key);

        let assignments = course_data['assignments'];

        if (!assignments) {
            await this.set_course_data(course_key, 'assignments', JSON.stringify([assignment_key]));
            return;
        }

        if (!assignments.includes(assignment_key)) {
            assignments.push(assignment_key);
            await this.set_course_data(course_key, 'assignments', JSON.stringify(assignments));
        }
    }



    async add_course_group_to_course (course_group_key, course_key) {

        try {
            let course_data = await this.get_course_data(course_key);
            let active_course_groups = course_data['active_course_groups'];

            if(!active_course_groups) {
                await this.set_course_data(course_key, 'active_course_groups', JSON.stringify([course_group_key]));
                return;
            }
            if (!active_course_groups.includes(course_group_key)) {
                active_course_groups.push(course_group_key);
                await this.set_course_data(course_key, 'active_course_groups', JSON.stringify(active_course_groups));
            }

        } catch (e) {
            console.warn(e);
            throw e;
        }
    }


    async add_course_group_set_to_course (course_group_set_key, course_key) {
        try {
            let course_data = await this.get_course_data(course_key);
            let course_group_sets = course_data['course_group_sets'];

            if(!course_group_sets) {
                await this.set_course_data(course_key, 'course_group_sets', JSON.stringify([course_group_set_key]));
                return;
            }

            if (!course_group_sets.includes(course_group_set_key)) {
                course_group_sets.push(course_group_set_key);
                await this.set_course_data(course_key, 'course_group_sets', JSON.stringify(course_group_sets));
            }

        } catch (e) {
            console.warn(e);
            throw e;
        }
    }



    async add_student_to_course (import_handler, user_key, course_key) {
        try {
            let course_data = await this.get_course_data(course_key);
            let active_students = course_data['active_students'];
            let blocked_students = course_data['blocked_students'];

            if(!active_students) {
                await this.set_course_data(course_key, 'active_students', JSON.stringify([user_key]));
            } else if (!active_students.includes(user_key)) {
                active_students.push(user_key);
                await this.set_course_data(course_key, 'active_students', JSON.stringify(active_students));
            }

            if (!blocked_students) {
                await this.set_course_data(course_key, 'blocked_students', JSON.stringify([]));
            } else {

                blocked_students = blocked_students.filter(student => {
                    return user_key !== student;
                });
                await this.set_course_data(course_key, 'blocked_students', JSON.stringify(blocked_students));
            }

            let user_db_handler = await import_handler.user_db_handler;
            await user_db_handler.add_course_to_student(user_key, course_key);
        } catch (e) {
            console.warn(e);
            throw e;
        }
    }



    async add_instructor_to_course (user_key, course_key) {
        let course_data = await this.get_course_data(course_key);
        let instructors = course_data['instructors'];

        if (!instructors) {
            await this.set_course_data(course_key, 'instructors', JSON.stringify([user_key]));
            return;
        }

        if (!instructors.includes(user_key)) {
            instructors.push(user_key);
            await this.set_course_data(course_key, 'instructors', JSON.stringify(instructors));
        }
    }


    async get_course_details_from_ldap_string(course_string) {
        const is_instructor_course = course_string.includes('instructor');
        const comma_index = course_string.indexOf(',');
        course_string = course_string.substring(3, comma_index);
        course_string = course_string.replace('_instructor', '');
        let details = course_string.split('_');

        if (details.length < 2)
            throw new RichReviewError('Invalid Course');

        return {
            'id': course_string,
            'title': `${details[0]} ${details[1]} ${details[2]}`,
            'dept': details[0],
            'number': details[1],
            'section': details[2],
            'year': details[3],
            'institution': 'UBC',
            'is_instructor_course': is_instructor_course
        }
    }



    async create_course (course_key, course_data) {
        if(course_data['id'] === undefined ||
            course_data['title'] === undefined  ||
            course_data['dept'] === undefined  ||
            course_data['number'] === undefined  ||
            course_data['section'] === undefined ) {
                throw new RichReviewError('Invalid course data');
        }

        await this.set_course_data(course_key, 'title', '');
        await this.set_course_data(course_key, 'dept', '');
        await this.set_course_data(course_key, 'section', '');
        await this.set_course_data(course_key, 'number', '');
        await this.set_course_data(course_key, 'year', '');
        await this.set_course_data(course_key, 'institution', '');
        await this.set_course_data(course_key, 'description', '');
        await this.set_course_data(course_key, 'instructors', '[]');
        await this.set_course_data(course_key, 'tas', '[]');
        await this.set_course_data(course_key, 'active_students', '[]');
        await this.set_course_data(course_key, 'blocked_students', '[]');
        await this.set_course_data(course_key, 'assignments', '[]');
        await this.set_course_data(course_key, 'deleted_assignments', '[]');

        // await this.set_course_data(course_key, 'active_course_groups', '[]');
        // await this.set_course_data(course_key, 'inactive_course_groups', '[]');
        await this.set_course_data(course_key, 'course_group_sets', '[]');

        await this.set_course_data(course_key, 'is_active', 'true');

        for (let field in course_data) {
            await this.set_course_data(course_key, field, course_data[field]);
        }
    }



    async create_submitters_for_student (import_handler, user_key, course_key, user_assignments) {
        let submission_db_handler = await import_handler.submission_db_handler;
        let assignment_db_handler = await import_handler.assignment_db_handler;
        let group_db_handler = await import_handler.group_db_handler;
        let doc_db_handler = await import_handler.doc_db_handler;
        let user_db_handler = await import_handler.user_db_handler;

        let course_data = await this.get_course_data(course_key);

        for (const assignment of course_data['assignments']) {
            if (!user_assignments.includes(assignment)) {
                let assignment_data = await assignment_db_handler.get_assignment_data('', assignment);
                if (assignment_data['type'] === 'document_submission') {
                    let submission_key = await submission_db_handler.create_submission_for_single_user(import_handler,
                        course_key,
                        assignment,
                        user_key,
                        '');
                    await assignment_db_handler.add_submission_to_assignment(assignment, submission_key);
                } else {
                    let assignment_group_key = assignment_data['group'];
                    let group_data = await group_db_handler.get_group_data(assignment_group_key);

                    let doc_key = group_data['docid'];
                    let group_key = await group_db_handler.create_group(group_data['userid_n'], doc_key);

                    await doc_db_handler.add_group_to_doc(doc_key, group_key);
                    await group_db_handler.add_user_to_group(user_key.replace(KeyDictionary.key_dictionary['user'], ''), group_key);
                    await user_db_handler.add_group_to_user(user_key, group_key);

                    let submission_key = await submission_db_handler.create_submission_for_single_user(import_handler,
                        course_key,
                        assignment,
                        user_key,
                        group_key);
                    await assignment_db_handler.add_submission_to_assignment(assignment, submission_key);

                    await group_db_handler.add_submission_to_group(group_key, submission_key);
                }
            }
        }
    }


    set_course_data (course_key, field, value) {
        return new Promise((resolve, reject) => {
            console.log('Redis hset request to key: ' + course_key);
            this.db_handler.client.hset(course_key, field, value, (error, result) => {
                if (error) {
                    console.log(error);
                    reject(error);
                }
                console.log('SET result -> ' + result);
                resolve();
            });
        })
    }



    get_course_data (course_key) {
        return new Promise((resolve, reject) => {
            console.log('Redis request to key: ' + course_key);
            this.db_handler.client.hgetall(course_key, function (error, result) {
                if(result === null){
                    error = new Error("Cannot find the course with the key: " + course_key);
                }
                if (error) {
                    console.log(error);
                    reject(error);
                }
                console.log('GET result -> ' + { result });

                let parsed_data = RedisToJSONParser.parse_data_to_JSON(result);

                resolve(parsed_data);
            });
        });
    }


    get_course_ids (user) {
        return new Promise((resolve, reject) => {
            console.log('Redis request to key: ' + user);
            this.db_handler.client.hgetall(user, function (error, result) {
                if (error) {
                    console.log(error);
                    reject(error);
                }
                console.log('GET result -> ' + { result });
                let course_ids = {
                    enrolments: JSON.parse(result.enrolments),
                    taing: JSON.parse(result.taing),
                    teaching: JSON.parse(result.teaching)
                };
                resolve(course_ids);
            });
        })
    }



    async get_user_course_enrolments (import_handler, user_key, course_keys) {

        let assignment_db_handler = await import_handler.assignment_db_handler;
        let submitter_db_handler = await import_handler.submitter_db_handler;

        let enrolments = [];

        for (let course_key of course_keys) {
            let course_data = await this.get_course_data(course_key);

            let filtered_assignments = [];

            for (let assignment_key of course_data['assignments']) {
                let submitter_exists = await submitter_db_handler.does_user_have_submitter(import_handler, user_key, assignment_key);
                console.log(submitter_exists);
                if (await assignment_db_handler.get_assignment_data(user_key, assignment_key))
                    filtered_assignments.push(assignment_key);
            }

            course_data['assignments'] = filtered_assignments;

            if (course_data['is_active'] && course_data['active_students'].includes(user_key))
                enrolments.push(course_data);
        }

        return enrolments;
    }



    async get_course_tas_and_instructors (course_key) {
        let course_data = await this.get_course_data(course_key);
        let tas = course_data['tas'];
        let instructors = course_data['instructors'];

        return {
            tas: tas,
            instructors: instructors
        }
    }


    get_user_course_taings (user, taings) {

        let enrolment_promises = taings.map((taing) => {

            return new Promise((resolve, reject) => {
                console.log('Redis request to key: ' + user);
                this.db_handler.client.hgetall(taing, (error, result) => {
                    if (error) {
                        console.log(error);
                        reject(error);
                    }
                    console.log('GET result -> ' + {result});

                    if (JSON.parse(result['tas']).includes(user)) {

                        result = RedisToJSONParser.parse_data_to_JSON(result);
                        resolve(result);
                    }

                    resolve(undefined);
                });
            })
        });

        return Promise.all(enrolment_promises).then((enrolments) => {
            return enrolments.filter((course) => course !== undefined);
        });
    }



    get_user_course_teachings (user, teachings) {

        let enrolment_promises = teachings.map((teaching) => {

            return new Promise((resolve, reject) => {
                console.log('Redis request to key: ' + user);
                this.db_handler.client.hgetall(teaching, (error, result) => {
                    if (error) {
                        console.log(error);
                        reject(error);
                    }
                    console.log('GET result -> ' + {result});

                    if (JSON.parse(result['instructors']).includes(user)) {
                        for (let field in result) {
                            try {
                                result[field] = JSON.parse(result[field]);
                            } catch (e) {}
                        }

                        resolve(result);
                    }

                    resolve(undefined);
                });
            })
        });

        return Promise.all(enrolment_promises).then((enrolments) => {
            return enrolments.filter((course) => course !== undefined);
        });
    }



    async get_all_course_assigmments (import_handler, user_key, course_key) {
        let course_data = await this.get_course_data(course_key);

        let assignment_keys = course_data['assignments'];

        let assignment_db_handler = await import_handler.assignment_db_handler;

        let assignments = [];

        for (let assignment_key of assignment_keys) {
            let assignment_data = await assignment_db_handler.get_assignment_data(user_key, assignment_key);
            assignments.push(assignment_data);
        }

        return assignments;
    }



    async get_course_instructors (course_key) {
        let course_data = await this.get_course_data(course_key);
        return course_data['instructors'];
    }



    async deactivate_student (user_key, course_key) {
        let course_data = await this.get_course_data(course_key);
        let active_students = course_data['active_students'];
        let blocked_students = course_data['blocked_students'];

        active_students = active_students.filter(student => {
            return student !== user_key
        });
        blocked_students.push(user_key);

        await this.set_course_data(course_key, 'active_students', JSON.stringify(active_students));
        await this.set_course_data(course_key, 'blocked_students', JSON.stringify(blocked_students));
    }



    async remove_instructor_from_course (user_key, course_key) {
        let course_data = await this.get_course_data(course_key);
        let instructors = course_data['instructors'];

        instructors = instructors.filter(instructor => {
            return instructor !== user_key
        });

        await this.set_course_data(course_key, 'instructors', JSON.stringify(instructors));
    }


    async remove_course_group_set_from_course (course_group_set_key, course_key) {
        let course_data = await this.get_course_data(course_key);
        let course_group_sets = course_data['course_group_sets'];

        course_group_sets = course_group_sets.filter(course_group_set => {
            return course_group_set !== course_group_set_key
        });

        await this.set_course_data(course_key, 'course_group_sets', JSON.stringify(course_group_sets));
    }




    async delete_assignment_from_course (assignment_key, course_key) {
        let course_data = await this.get_course_data(course_key);
        let assignments = course_data['deleted_assignments'];

        assignments = assignments.filter(assignment => {
            return assignment !== assignment_key;
        });

        await this.set_course_data(course_key, 'deleted_assignments', JSON.stringify(assignments));
    }



    async deactivate_course_group (course_key, course_group_key) {
        let course_data = await this.get_course_data(course_key);
        let active_course_groups = course_data['active_course_groups'];
        let inactive_course_groups = course_data['inactive_course_groups'];

        active_course_groups = active_course_groups.filter(course_group => {
            return course_group !== course_group_key;
        });

        inactive_course_groups.push(course_group_key);

        await this.set_course_data(course_key, 'active_course_groups', JSON.stringify(active_course_groups));
        await this.set_course_data(course_key, 'inactive_course_groups', JSON.stringify(inactive_course_groups));
    }


    async permanently_delete_course_group (course_key, course_group_key) {
        let course_data = await this.get_course_data(course_key);
        let active_course_groups = course_data['active_course_groups'];
        let inactive_course_groups = course_data['inactive_course_groups'];

        active_course_groups = active_course_groups.filter((active_key) => {
            return active_key !== course_group_key;
        });

        inactive_course_groups = inactive_course_groups.filter((inactive_key) => {
            return inactive_key !== course_group_key;
        });

        await this.set_course_data(course_key, 'active_course_groups', JSON.stringify(active_course_groups));
        await this.set_course_data(course_key, 'inactive_course_groups', JSON.stringify(inactive_course_groups));
    }



    async move_assignment_to_deleted_assignments (course_key, assignment_key) {
        let course_data = await this.get_course_data(course_key);

        let assignments = course_data['assignments'];

        if (!assignments.includes(assignment_key))
            throw new RichReviewError('The assignment does not exist in this course');

        assignments = assignments.filter((assignment) => {
            return assignment !== assignment_key;
        });

        await this.set_course_data(course_key, 'assignments', JSON.stringify(assignments));

        let deleted_assignments = course_data['deleted_assignments'];
        deleted_assignments.push(assignment_key);
        await this.set_course_data(course_key, 'deleted_assignments', JSON.stringify(deleted_assignments));
    }


    async restore_deleted_course_assignment (course_key, assignment_key) {
        let course_data = await this.get_course_data(course_key);

        let deleted_assignments = course_data['deleted_assignments'];

        if (!deleted_assignments.includes(assignment_key))
            throw new RichReviewError('The assignment does not exist in this course');

        deleted_assignments = deleted_assignments.filter((assignment) => {
            return assignment !== assignment_key;
        });

        await this.set_course_data(course_key, 'deleted_assignments', JSON.stringify(deleted_assignments));

        let assignments = course_data['assignments'];
        assignments.push(assignment_key);
        await this.set_course_data(course_key, 'assignments', JSON.stringify(assignments));
    }



    async verify_submitters_for_all_students (import_handler, course_key) {
        let user_db_handler = await import_handler.user_db_handler;

        let course_data = await this.get_course_data(course_key);

        for (const student of course_data['active_students']) {
            try {
                await user_db_handler.verify_submitters_for_course(import_handler, student, course_key);
            } catch (e) {
                console.warn(e);
            }
        }
    }



    async is_valid_course_key (course_key) {
        try {
            await this.get_course_data(course_key);
            return true;
        } catch (e) {
            return false;
        }
    }

    async is_user_enrolled_in_course (user_key, course_key) {
        let course_data = await this.get_course_data(course_key);
        return course_data['active_students'].includes(user_key);
    }

    async is_user_instructor_for_course (user_key, course_key) {
        let course_data = await this.get_course_data(course_key);
        return course_data['instructors'].includes(user_key);
    }
}

module.exports = CourseDatabaseHandler;

