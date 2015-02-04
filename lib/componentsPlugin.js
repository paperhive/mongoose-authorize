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
          return done(null, _.union(_.flattenDeep([components, results])));
        });
      };

    /* Resolve a component (maybe undefined, a string or a function) */
    function componentResolve(component, doc, cb) {
      if (!component || _.isString(component)) {
        return cb(null, component);
      }
      return component(doc, cb);
    }

    /* toObject-like function that only returns the fields where the user
     * has read permissions.
     *
     * TODO: process virtual fields
     */
    schema.methods[config.authorizedToObject] =
      function (userId, optionsToObject, done) {

        // allow to omit optionsToObject
        if (_.isFunction(optionsToObject)) {
          done = optionsToObject;
          optionsToObject = undefined;
        }

        return authorizedToObject(this, userId, optionsToObject, [], done);
      };

    function authorizedToObject (doc, userId, optionsToObject, visitedDocs, done) {
      // has this doc already been processed?
      var id = doc._id.toString();
      if (visitedDocs && _.contains(visitedDocs, id)) {
        return done(null, id);
      }
      if (!visitedDocs) visitedDocs = [];
      visitedDocs.push(id);

      return async.waterfall([
        function (cb) {
          // get components the user has permissions to read
          return doc[config.authorizedComponents](userId, 'read', cb);
        },
        function (components, cb) {
          return docToObject(userId, optionsToObject, doc, components, visitedDocs,
                           cb);
        }
      ], done);
    }

    function docToObject (userId, optionsToObject, doc, readComponents, visitedDocs,
                        done) {

      processObj(doc.toObject(optionsToObject), undefined, function (err, obj) {
        if (err) return done(err);
        if (!obj || _.isEmpty(obj)) return done();

        // insert _id
        obj._id = doc._id.toString();
        return done(null, obj);
      });

      // recursively process objects until a subdocument is reached
      function processObj (obj, path, cbObj) {

        // helper function for processing leaf elements
        function processLeaf(obj, objdoc, pathOptions, schema, cbLeaf) {
          // is sub/embedded document (authorization is checked there)
          if (schema) {
            return docToObject(userId, optionsToObject, objdoc, readComponents,
                             _.clone(visitedDocs, true), cbLeaf);
          }

          // check access to component
          componentResolve(pathOptions.component, doc,
                           function (err, component) {
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
              return authorizedToObject(objdoc, userId, optionsToObject,
                                      _.clone(visitedDocs, true), cbLeaf);
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
            // iterate over obj and corresponding mongoose objects
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

        // virtual
        var virtualConfig = doc.schema.virtuals[path];
        if (virtualConfig) {
          // check access to component
          return componentResolve(virtualConfig.options.component, doc,
                           function (err, component) {
            if (err) return cbObj(err);

            if (!component || !_.contains(readComponents, component)) {
              return cbObj();
            }

            return cbObj(null, obj);
          });
        }

        // should never be reached!
        return cbObj(new Error('unhandled type'));
      }
    }

    /*
     * Checks if the provided object can be set by the userId in the provided
     * doc and sets the data. If the userId is not authorized to write a field,
     * the document is not modified at all.
     *
     * Parameters:
     *  * obj: input as a plain object. The following values are allowed:
     *     * primitives: String, Number, Boolean, null
     *     * plain objects: must correspond to a nested object (not referenced
     *       and populated documents)
     *     * arrays with primitives (arrays of subdocuments are not allowed and
     *       have to be processed separately with TODO)
     */
    schema.methods[config.authorizedSet] =
      function (userId, obj, options, done) {
        if (_.isUndefined(done)) {
          done = options;
          options = {};
        }
        authorizedSet(this, userId, obj, options, done);
      };
    function authorizedSet(doc, userId, obj, options, done) {
      options = options || {};
      if (!_.isPlainObject(obj)) {
        return done(new Error('obj must be a plain object'));
      }
      // TODO: check if doc is document
      return async.waterfall([
        function (cb) {
          // get components the user has permissions to write
          // TODO: get components via parent doc if doc is a nested doc
          return doc[config.authorizedComponents](userId, 'write', cb);
        },
        function (writeComponents, cb) {
          // recursively check if obj can be set on the doc
          return checkObjectSchema(obj, doc.schema, doc, writeComponents,
            function (err) {
              if (err) return cb(err);
              return cb(null, writeComponents);
            }
          );
        },
        // (only reached if the check above was successful)
        function (writeComponents, cb) {
          // overwrite? -> remove all user-writeable fields
          if (options.overwrite) {
            _.forEach(doc.schema.paths, function (path) {
              // check permission for this path
              if (!path.options.component ||
                  !_.contains(writeComponents, path.options.component))
                return;

              if (_.isArray(path.options.type)) {
                // do not touch subdocuments
                if (path.schema) return;
              }
              doc.set(path.path, undefined);
            });
          }

          // set obj on the document
          doc.set(obj);
          cb();
        }
      ], done);
    }

    /* recursively walks the object and checks if it complies with the
     * provided document schema and writeComponents
     *
     * Parameters:
     *  * obj: see authorizedSet
     *  * schema: a document schema
     *  * doc (optional) a document which is passed to component functions
     *  * writeComponents: see authorizedSet
     *  * done: function callback(err)
     */
    function checkObjectSchema(obj, schema, doc, writeComponents, done) {

      checkObj(obj, null, done);

      /* recursively walk through objects.
       * (does not process referenced documents)
       * Parameters:
       *  * obj an object or array with data to be stored
       *  * path: current path for obj in doc. Either:
       *    * path is undefined (dst is the root object)
       *    * path is a string (schema.nested[path] is true, i.e. dst is a nested
       *      object)
       *  * cbObj: callback with signature function cbObj(err)
       */
      function checkObj (obj, path, cbObj) {
        // is obj a plain object?
        if (!_.isPlainObject(obj)) {
          return cbObj(new Error('plain object expected'));
        }
        // either no path (root level) or valid path (nested obj)
        if (path && !schema.nested[path]) {
          return cbObj(new Error('path is not a valid nested doc'));
        }

        // iterate over key-value pairs
        return async.parallel(
          _.map(obj, function (value, key) {
            return function (cb) {
              var curPath = path ? path + '.' + key : key;

              // 'leaf' path (in this document)
              var pathConfig = schema.paths[curPath];
              if (pathConfig) {

                // is array
                if (_.isArray(pathConfig.options.type)) {
                  if (!_.isArray(value)) {
                    return cb(new Error('array expected at path ' + curPath));
                  }
                  // check that array does not contain subdocuments
                  if (pathConfig.schema) {
                    return cb(new Error(
                      'setting subdocuments in arrays is not allowed'
                    ));
                  }
                  // iterate over array elements
                  return async.parallel(_.map(value, function (element) {
                    return function (cbElement) {
                      return checkLeaf(element, curPath,
                                       pathConfig.options.type[0].component ||
                                       pathConfig.options.component,
                                       cbElement);
                    };
                  }), cb);
                }

                // primitive leaf element
                return checkLeaf(value, curPath, pathConfig.options.component, cb);
              }

              // nested document
              if (schema.nested[curPath]) {
                return checkObj(value, curPath, cb);
              }

              // should never be reached!
              return cb(new Error('unhandled type'));
            };
          }),
          function (err) {
            return cbObj(err);
          }
        ); // async.parallel
      } // checkObj

      /* check a 'leaf' value in current document:
       * Parameters:
       *  * value: a primitive (String, Number, Boolean, null)
       *  * path: the path for this value (doc.schema.paths[path] must be valid)
       *  * cbKey: callback with signature function cbKey(err)
      */
      function checkLeaf(value, path, component, cbLeaf) {
        // check access to component
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

          // primitive JSON type or undefined
          if (_.isNull(value) || _.isString(value) ||
              _.isNumber(value) || _.isBoolean(value) ||
              _.isUndefined(value)) {
            return cbLeaf();
          }

          // should never be reached!
          return cbLeaf(new Error(
            'unhandled type! are you trying to update a populated reference?'
          ));
        }); // componentFun
      } // checkLeaf
    }

    schema.methods[config.authorizedArrayPush] =
      function (userId, array, obj, done) {
        var doc = this;

        if (!_.isPlainObject(obj)) {
          return done(new Error('obj must be a plain object'));
        }

        return async.waterfall([
          function (cb) {
            // get components the user has permissions to write
            // TODO: get components via parent doc if doc is a nested doc
            return doc[config.authorizedComponents](userId, 'write', cb);
          },
          function (writeComponents, cb) {
            // resolve array component
            return componentResolve(
              array._schema.options.component, null,
              function (err, component) {
                if (err) return cb(err);
                // check if the user has write permissions on the array
                if (!component || !_.contains(writeComponents, component)) {
                  return cb(new Error(
                    'not allowed to write array at path ' + array._path
                  ));
                }

                // check obj with the subdocument's schema
                return checkObjectSchema(obj, array._schema.schema, null, 
                                       writeComponents, cb);
              }
            );
          },
          function (cb) {
            // push obj to the array
            array.push(obj);
            cb();
          }
        ], done);
      }; // authorizedArrayPush

    schema.methods[config.authorizedArrayRemove] =
      function (userId, array, id, done) {
        var doc = this;

        return async.waterfall([
          function (cb) {
            // get components the user has permissions to write
            // TODO: get components via parent doc if doc is a nested doc
            return doc[config.authorizedComponents](userId, 'write', cb);
          },
          function (writeComponents, cb) {
            // resolve array component
            return componentResolve(
              array._schema.options.component, null,
              function (err, component) {
                if (err) return cb(err);
                // check if the user has write permissions on the array
                if (!component || !_.contains(writeComponents, component)) {
                  return cb(new Error(
                    'not allowed to write array at path ' + array._path
                  ));
                }
                return cb();
              }
            );
          },
          function (cb) {
            // remove subdocument from array
            var el = array.id(id);
            if (!el) {
              return cb(new Error('element with id ' + id + ' does not exist'));
            }
            el.remove();
            cb();
          }
        ], done);
      }; // authorizedArrayRemove

    schema.methods[config.authorizedArraySet] =
      function (userId, array, id, obj, done) {
        var doc = this;

        if (!_.isPlainObject(obj)) {
          return done(new Error('obj must be a plain object'));
        }

        return async.waterfall([
          function (cb) {
            // get components the user has permissions to write
            // TODO: get components via parent doc if doc is a nested doc
            return doc[config.authorizedComponents](userId, 'write', cb);
          },
          function (writeComponents, cb) {
            // remove subdocument from array
            var subdoc = array.id(id);
            if (!subdoc) {
              return cb(new Error('element with id ' + id + ' does not exist'));
            }
            // recursively check if obj can be set on the doc
            return checkObjectSchema(
              obj, array._schema.schema, subdoc, writeComponents,
              function (err) {
                if (err) return cb(err);
                cb(null, subdoc);
              }
            );
          },
          function (subdoc, cb) {
            // update subdocment
            subdoc.set(obj);
            cb();
          }
        ], done);
      }; // authorizedArraySet
  };
};
