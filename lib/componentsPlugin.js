'use strict';
var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

module.exports = function (config) {
  return function (schema, options) {
    options = options || {};

    // compile an array of all components where the provided userId is able
    // to carry out the provided action
    schema.methods[config.authorizedComponents] =
      function (userId, action, done) {
        var components = [];

        // fetch default permissions from plugin options
        var defaultComponents =
          options.permissions &&
          options.permissions.defaults &&
          options.permissions.defaults[action];
        if (_.isArray(defaultComponents)) {
          components = defaultComponents;
        }

        var doc = this;
        var tasks = [];

        // fetch permissions from function provided in plugin options
        if (options.permissions && _.isFunction(options.permissions.fromFun)) {
          tasks.push(function (cb) {
            return options.permissions.fromFun(doc, userId, action, cb);
          });
        }

        // fetch permissions from document
        if (options.permissions && options.permissions.fromDoc) {
          tasks.push(function (cb) {
            return doc[config.permissionsGetComponents](userId, action, cb);
          });
        }

        async.parallel(tasks, function (err, results) {
          if (err) return done(err);
          return done(null, _.union(_.flatten([components, results])));
        });
      };

    /* toJSON-like function that only returns the fields where the user
     * has read permissions.
     *
     * TODO: process virtual fields
     */
    schema.methods[config.authorizedToJSON] =
      function (userId, optionsToJSON, done) {
        // allow to omit optionsToJSON
        if (_.isFunction(optionsToJSON)) {
          done = optionsToJSON;
          optionsToJSON = undefined;
        }

        var doc = this;
        return async.waterfall([
          function (cb) {
            // get components the user has permissions to read
            return doc[config.authorizedComponents](userId, 'read', cb);
          },
          function (components, cb) {
            return docToJSON(userId, optionsToJSON, doc, components, cb);
          }
        ], done);
      };

    function docToJSON (userId, optionsToJSON, doc, readComponents, done) {

      processObj(doc.toJSON(optionsToJSON), undefined, function (err, json) {
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
            return docToJSON(userId, optionsToJSON, objdoc, readComponents, cbLeaf);
          }

          // check access to component
          var component = pathOptions.component;
          var componentFun = _.isFunction(component) ?
            component :
            function (doc, cb) {
              return cb(null, component);
            };

          componentFun(doc, function (err, component) {
            if (err) return cbLeaf(err);

            if (!component || !_.contains(readComponents, component)) {
              return cbLeaf();
            }

            // referenced document
            if (pathOptions.ref) {
              // unpopulated (id only)
              if (obj instanceof mongoose.Types.ObjectId) {
                return cbLeaf(null, obj.toString());
              }

              // populated
              return objdoc.authorizedToJSON(userId, optionsToJSON, cbLeaf);
            }

            // primitive JSON type
            if (_.isNull(obj) || _.isString(obj) ||
                _.isNumber(obj) || _.isBoolean(obj)) {
              return cbLeaf(null, obj);
            }

            // should never be reached!
            return cbLeaf(new Error('unhandled type!'));
          }); // componentFun
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
        var pathConfig = doc.schema.paths[path];
        if (pathConfig) {

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

    // Note: optionsFromJSON currently unused
    schema.methods[config.authorizedFromJSON] =
      function (userId, json, optionsFromJSON, done) {
        if (_.isFunction(optionsFromJSON)) {
          done = optionsFromJSON;
          optionsFromJSON = undefined;
        }

        var doc = this;
        return async.waterfall([
          function (cb) {
            // get components the user has permissions to write
            return doc[config.authorizedComponents](userId, 'write', cb);
          },
          function (components, cb) {
            return docFromJSON(userId, optionsFromJSON, doc, components, json, cb);
          }
        ], done);
      };

    function docFromJSON (userId, optionsFromJSON, doc, writeComponents, json, done) {

      setObj(json, doc, undefined, done);

      /* Set a primitive value as dst[dstKey] if the permissions allow to do so.
       * Parameters:
       *  * value: a number, bool, string or null
       *  * dst may be
       *    * an array: dstKey must be an index (int)
       *    * an object: dstKey must be a key (string)
       *  * path: the path for this value (doc.schema.paths[path] must be
       *          valid)
       *  * cbKey: callback with signature function cbKey(err)
      */
      function setLeaf(value, dst, dstKey, path, cbLeaf) {
        var pathOptions = doc.schema.paths[path].options;

        // check access to component
        var component = pathOptions.component;
        var componentFun = _.isFunction(component) ?
          component :
          function (doc, cb) {
            return cb(null, component);
          };

        componentFun(doc, function (err, component) {
          if (err) return cbLeaf(err);

          if (!component || !_.contains(writeComponents, component)) {
            return cbLeaf(new Error('not allowed to write path ' + path));
          }

          // primitive JSON type
          if (_.isNull(value) || _.isString(value) ||
              _.isNumber(value) || _.isBoolean(value)) {
            dst[dstKey] = value;
            return cbLeaf();
          }

          // should never be reached!
          return cbLeaf(new Error('unhandled type!'));
        }); // componentFun
      }

      /* recursively walk through objects and arrays
       * -> call setLeaf only for primitives in src
       * (does not process referenced documents)
       * Parameters:
       *  * src: an object or array with data to be stored
       *  * dst: an (mongoose) object or array
       *  * path: current path for dst in doc. Either:
       *    * path is undefined (dst is the root object)
       *    * path is a string (doc.nested[path] is true, i.e. dst is a nested
       *      object)
       *  * cbObj: callback with signature function cbObj(err)
       */
      function setObj (src, dst, path, cbObj) {
        // dst is an object
        if (!path || doc.schema.nested[path]) {
          if (!_.isPlainObject(src)) {
            return cbObj(new Error('plain object expected'));
          }

          // iterate over key-value pairs of src
          return async.parallel(
            _.map(src, function (value, key) {
              return function (cb) {
                var curPath = path ? path + '.' + key : key;

                // 'leaf' path (in this document)
                var pathConfig = doc.schema.paths[curPath];
                if (pathConfig) {

                  // is array
                  if (_.isArray(pathConfig.options.type)) {
                    // TODO
                    return cb(new Error('arrays not yet implemented'));
                  }

                  return setLeaf(value, dst, key, curPath, cb);
                }

                // nested document
                if (doc.schema.nested[curPath]) {
                  return setObj(value, dst[key], curPath, cb);
                }

                // should never be reached!
                return cb(new Error('unhandled type'));
              };
            }),
            cbObj
          );
        }


        // should never be reached!
        return cbObj(new Error('unhandled type'));
      }
    }

  };
};
