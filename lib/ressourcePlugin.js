var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

module.exports = function (config) {
  return function (schema, options) {
    /* toJSON-like function that only returns the fields where the user
     * has read permissions.
     *
     * TODO: process virtual fields
     */
    schema.methods.authorizedToJSON = function (userId, done) {
      var doc = this;
      return async.waterfall([
        function (cb) {
          // get ressources the user has permissions to read
          return doc[config.permissionsGetRessources](userId, 'read', cb);
        },
        function (ressources, cb) {
          return docToJSON(userId, doc, ressources, cb);
        }
      ], done);
    };

    function docToJSON (userId, doc, readRessources, done) {

      processObj(doc.toJSON(), undefined, function (err, json) {
        if (err) return done(err);
        if (!json || _.isEmpty(json)) return done();

        // insert _id
        json._id = doc._id.toString();
        return done(null, json);
      });

      // recursively process objects until a subdocument is reached
      function processObj (obj, path, cbObj) {

        // helper function for processing leaf elements
        function processLeaf(obj, objdoc, pathOptions, schema, cbLeaf) {
          // is sub/embedded document (authorization is checked there)
          if (schema) {
            return docToJSON(userId, objdoc, readRessources, cbLeaf);
          }

          // check access to ressource
          var ressource = pathOptions.ressource;
          if (_.isFunction(ressource)) {
            ressource = ressource(doc);
          }
          if (!ressource || !_.contains(readRessources, ressource)) {
            return cbLeaf();
          }

          // referenced document
          if (pathOptions.ref) {
            // populated?
            if (_.isObject(obj)) {
              return objdoc.authorizedToJSON(userId, cbLeaf);
            }
            // unpopulated (id only)
            return cbLeaf(null, obj);
          }

          // primitive JSON type
          if (_.isNull(obj) || _.isString(obj) ||
              _.isNumber(obj) || _.isBoolean(obj)) {
            return cbLeaf(null, obj);
          }

          // should never be reached!
          return cbLeaf(new Error('unhandled type!'));
        }

        // root object or nested object
        if (!path || doc.schema.nested[path]) {
          return async.parallel(
            // process keys
            _.mapValues(obj, function (value, key) {
              return function (cb) {
                var curPath = path ? path + '.' + key : key;
                return processObj(value, curPath, cb);
              };
            }),
            // remove keys with undefined values
            function (err, result) {
              if (err) return cbObj(err);
              result = _.pick(result, function (value) {
                return value !== undefined;
              });
              // return undefined instead of empty object
              return cbObj(null, _.isEmpty(result) ? undefined : result);
            }
          );
        }

        // 'leaf' path (in this document)
        if (doc.schema.paths[path]) {
          var pathConfig = doc.schema.paths[path];

          // is array
          if (_.isArray(pathConfig.options.type)) {
            // iterate over JSON and corresponding mongoose objects
            return async.parallel(_.map(
              _.zip(obj, doc.get(path)),
              function (value) {
                return function (cb) {
                  processLeaf(
                    value[0], value[1],
                    pathConfig.options.type[0], pathConfig.schema,
                    cb
                  );
                };
              }
            ), function (err, results) {
              if (err) return cbObj(err);
              results = _.compact(results);
              cbObj(null, results.length ? results : undefined);
            });
          }

          return processLeaf(obj, doc.get(path),
                             pathConfig.options, pathConfig.schema,
                             cbObj
                            );
        }

        // should never be reached!
        return cbObj(new Error('unhandled type'));
      }
    }
  };
};
