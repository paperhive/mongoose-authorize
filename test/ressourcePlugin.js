var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('lodash');
var bcrypt = require('bcrypt');

var authorize = require('../');
var utils = require('./utils');

// clear database before each run
beforeEach(utils.clearDB);
beforeEach(utils.insertDocs);

describe('ressourcePlugin', function () {

  describe('#authToJSON', function () {
    it('should only return fields the user is allowed to read', function (done) {
      utils.insertDocs(function (err, user1, user2, team1, team2, orga1) {
        function ressourcePlugin(schema, options) {

          /* toJSON-like function that only returns the fields where the user
           * has read permissions.
           *
           * TODO: process virtual fields
           */

          function docToJSON (doc, readRessources) {
            // TODO: get ressources from permissions for given user
            readRessources = readRessources || ['info', 'settings', 'contactVisible'];

            // recursively process document until a subdocument is reached
            function processObj (obj, path) {
              // check if path is valid
              if (path && !doc.schema.paths[path] && !doc.schema.nested[path]) {
                return;
              }

              // obj is an array
              if (_.isArray(obj)) {
                var array = _.compact(_.map(doc.get(path), function (value) {
                  // subdocument / embedded document
                  if (doc.schema.paths[path].schema) {
                    return docToJSON(value, readRessources);
                  }
                  // something else
                  return processObj(value, path);
                }));
                return array.length ? array : undefined;
              // obj is ObjectId
              } else if (obj instanceof mongoose.Types.ObjectId) {
                return processObj(obj.toString(), path);
              // obj is null, string, number, boolean
              } else if (_.isNull(obj) || _.isString(obj) ||
                         _.isNumber(obj) || _.isBoolean(obj)) {
                var ressource = doc.schema.paths[path].options.ressource;
                if (_.isFunction(ressource)) {
                  ressource = ressource(doc);
                }
                if (!ressource || !_.contains(readRessources, ressource)) {
                  return;
                }
                return obj;
              }
              // obj is an object
              else if (_.isObject(obj) && !_.isFunction(obj)) {
                var ret = {};

                // process keys
                _.each(_.keys(obj), function (key) {
                  var curPath = path ? path + '.' + key : key;

                  var data = processObj(obj[key], curPath);

                  // add data if we have data
                  if (data !== undefined) {
                    ret[key] = data;
                  }
                });

                return _.isEmpty(ret) ? undefined : ret;
              }
              // fail!
              console.log('error: unhandled case!');
              return;
            }

            var ret = processObj(doc.toJSON());
            if (_.isEmpty(ret)) return;

            // insert _id
            ret._id = doc._id.toString();
            return ret;
          }


          schema.methods.authorizedToJSON = function () {
            return docToJSON(this);
          };
        }

        var getEmailRessource = function (doc) {
          return doc.visible ? 'contactVisible' : 'contactHidden';
        };
        var emailSchema = new mongoose.Schema({
          address: {type: String, ressource: getEmailRessource},
          type: {type: String, ressouceClass: getEmailRessource},
          visible: {type: Boolean, ressource: 'contactSettings'}
        });

        var userSchema = new mongoose.Schema({
          name: {type: String, ressource: 'info'},
          passwordHash: {type: String, select: false},
          array: [String],
          emails_flat: [{type: String, ressource: 'info'}],
          emails_inline: [{
            address: {type: String, ressource: 'info'}
          }],
          emails: [emailSchema],
          settings: {
            rememberMe: {type: Boolean, ressource: 'settings'},
            other: {
              animation: {type: Boolean, ressource: 'settings'}
            }
          },
          knows: {type: mongoose.Schema.Types.ObjectId, ref: 'User', ressource: 'info'}
        });
        userSchema.plugin(ressourcePlugin, {ressource: 'info'});
        userSchema.plugin(authorize.permissionsPlugin);

        userSchema.methods.setPassword = function (userId, password, done) {
          var user = this;
          async.waterfall([
            // check permission
            function (cb) {
              if (userId != user._id) return cb(new Error('permission denied'));
              cb();
            },
            // generate salt
            function (cb) {
              bcrypt.genSalt(10, cb);
            },
            // generate hash
            function (salt, cb) {
              bcrypt.hash(password, salt, cb);
            },
            // store password
            function (hash, cb) {
              user.passwordHash = hash;
              cb();
            }
          ], done);
        };

        var User = mongoose.model('User1', userSchema);

        User.create({
          name: 'André',
          passwordHash: '0eaf4f4c',
          emails: [
            {address: 'andre@gaul.io', type: 'private', visible: true}
          ],
          settings: {rememberMe: true},
          knows: user1
        }, function (err, user) {
          if (err) return done(err);
          user.setPassword(user._id, 'pass', function (err) {
            if (err) return done(err);
            user.populate('knows', function () {
              console.log(user.authorizedToJSON());
              console.log(user);
              done();
            });
          });
        });
      });
    });
  });

});
