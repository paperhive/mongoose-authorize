var mongoose = require('mongoose');
var should = require('should');
var async = require('async');
var _ = require('underscore');

var authorize = require('../');
var utils = require('./utils');

// clear database before each run
beforeEach(utils.clearDB);
