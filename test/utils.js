var dbURI = 'mongodb://localhost/mongoose-authorize-test';
var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');

var authorize = require('../');

var clearDB = function (done) {
  async.series(_.flatten([
    // ensure a database connection is established
    function (cb) {
      if (mongoose.connection.db) return cb();
      mongoose.connect(dbURI, cb);
    },
    // drop collections
    function (cb) {
      mongoose.connection.db.collections(function (err, collections) {
        if (err) return cb(err);
        async.parallel(
          _.flatten(_.map(collections, function (collection) {
            if (collection.collectionName.match(/^system\./)) return [];
            return [
              // remove all documents in collection
              function (cb) {
                collection.remove({}, {safe: true}, cb);
              },
              // drop indexes in collection
              function (cb) {
                collection.dropIndexes(cb);
              }
            ];
          })),
          cb
        );
      });
    },
    // ensureIndexes
    _.map(models, function (model) {
      return model.ensureIndexes.bind(model);
    })
  ]),
  done);
};

var models = {};

// define User
var userSchema = new mongoose.Schema({name: String});
models.User = mongoose.model('User', userSchema);

// define Team
var teamSchema = new mongoose.Schema({name: String});
teamSchema.plugin(authorize.teamPlugin);
models.Team = mongoose.model('Team', teamSchema);

module.exports = {
  clearDB: clearDB,
  models: models
};
