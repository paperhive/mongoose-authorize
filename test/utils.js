var dbURI = 'mongodb://localhost/mongoose-authorize-test';
var mongoose = require('mongoose');
var async = require('async');
var _clearDB = require('mocha-mongoose')(dbURI, {noClear: true});

var clearDB = function (done) {
  async.series([
    // ensure a database connection is established
    function (cb) {
      if (mongoose.connection.db) return cb();
      mongoose.connect(dbURI, function(err) {
        if (err) return cb(err);
        // drop the full database (including indexes) after connecting
        // (not handled by clearDB)
        mongoose.connection.db.dropDatabase(cb);
      });
    },
    // drop collections
    _clearDB
  ],
  done);
};

module.exports = {
  clearDB: clearDB
};
