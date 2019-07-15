class GroupDatabaseHandler {

    constructor(){
        RedisClient.get_instance().then((db_handler) => {
            this.db_handler = db_handler;
        });
    }



    static async get_instance() {
        if (this.instance) {
            console.log('Database handler instance found');
            return this.instance;
        }

        this.instance = await new GroupDatabaseHandler();
        return this.instance;
    }



    async get_data_for_viewer (user_key, course_key, group_key) {

        let group_data = await this.get_group_data(group_key);

        if (!this.user_has_permission_to_view_group(user_key, course_key, group_data))
            throw new NotAuthorizedError('You are not authorized to view this document');

        let doc_db_handler = await DocumentDatabaseHandler.get_instance();
        let doc_data = await doc_db_handler.get_doc_data(group_data['docid']);

        return {
            r2_ctx: {
                pdfid: doc_data['pdfid'],
                docid: group_data['docid'].replace(KeyDictionary.key_dictionary['document'], ''),
                groupid: group_key.replace(KeyDictionary.key_dictionary['group'], ''),
                pdf_url: `${env.azure_config.storage.host}${doc_data['pdfid']}/doc.pdf`,
                pdfjs_url: `${env.azure_config.storage.host}${doc_data['pdfid']}/doc.vs_doc`,
                serve_dbs_url: process.env.HOST_URL
            },
            env: process.env.NODE_ENV,
            cdn_endpoint: env.azure_config.cdn.endpoint
        }
    }



    async get_number_of_users (group_key) {
        let group_data = await this.get_group_data(group_key);
        let users = group_data['users'];
        return users['participating'].length;
    }



    async get_group_data (group_key) {
        return new Promise((resolve, reject) => {
            console.log('Redis request to key: ' + group_key);
            this.db_handler.client.hgetall(group_key, async (error, result) => {
                if (error) {
                    console.log(error);
                    reject(error);
                }
                console.log('GET result -> ' + { result });

                let group_data = RedisToJSONParser.parse_data_to_JSON(result);

                resolve(group_data);
            });
        })
    }


    async add_user_to_group (user_id, group_key) {
        let group_data = await this.get_group_data(group_key);
        let users = group_data['users'];
        users['participating'].push(user_id);
        await this.set_group_data(group_key, 'users', JSON.stringify(users));
    }



    async create_group (user_id, doc_key) {
        let creation_time = Date.now();
        let group_key = `${KeyDictionary.key_dictionary['group']}${user_id}_${creation_time}`;

        await this.set_group_data(group_key, 'userid_n', user_id);
        await this.set_group_data(group_key, 'docid', doc_key);
        await this.set_group_data(group_key, 'creationTime', creation_time);
        await this.set_group_data(group_key, 'name', `Group created at ${new Date()}`);
        await this.set_group_data(group_key, 'submission', '');
        await this.set_group_data(group_key, 'users', JSON.stringify({
            invited: [],
            participating: [user_id]
        }));

        await this.set_group_data(group_key, 'write_blocked', '[]');
        return group_key;
    }




    async add_submission_to_group (group_key, submission_key) {
        await this.set_group_data(group_key, 'submission', submission_key);
    }



    async give_user_write_permissions (user_id, group_key) {
        let group_data = await this.get_group_data(group_key);
        let write_blocked = group_data['write_blocked'];

        write_blocked = write_blocked.filter((user) => {
            return user !== user_id;
        });

        await this.set_group_data(group_key, 'write_blocked', JSON.stringify(write_blocked));
    }


    async give_users_write_permissions (user_ids, group_key) {
        for (let user_id of user_ids) {
            await this.give_user_write_permissions(user_id, group_key);
        }
    }


    async remove_user_write_permissions (user_id, group_key) {
        let group_data = await this.get_group_data(group_key);
        let write_blocked = group_data['write_blocked'];

        write_blocked.push(user_id);

        await this.set_group_data(group_key, 'write_blocked', JSON.stringify(write_blocked));
    }



    set_group_data(group_key, field, value) {

        return new Promise((resolve, reject) => {
            console.log('Redis hset request to key: ' + group_key);
            this.db_handler.client.hset(group_key, field, value, (error, result) => {
                if (error) {
                    console.log(error);
                    reject(error);
                }
                console.log('SET result -> ' + result);
                resolve();
            });
        })
    }


    async user_has_permission_to_view_group (user_key, course_key, group_data) {
        return true;
    }
}

module.exports = GroupDatabaseHandler;

const env = require('../env');
const AzureHandler = require('./AzureHandler');
const RedisClient = require("./RedisClient");
const KeyDictionary = require("./KeyDictionary");
const RedisToJSONParser = require("./RedisToJSONParser");
const UserDatabaseHandler = require("./UserDatabaseHandler");
const DocumentDatabaseHandler = require("./DocumentDatabaseHandler");
const CourseDatabaseHandler = require("./CourseDatabaseHandler");
const NotAuthorizedError = require("../errors/NotAuthorizedError");


