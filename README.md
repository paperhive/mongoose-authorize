# mongoose-authorize [![Build Status](https://travis-ci.org/paperhub/mongoose-authorize.svg)](https://travis-ci.org/paperhub/mongoose-authorize) [![Dependency Status](https://gemnasium.com/paperhub/mongoose-authorize.svg)](https://gemnasium.com/paperhub/mongoose-authorize)

An **authorization** (*not* authentication) plugin for mongoose. It offers the following plugins:

 * [teamPlugin](#teamplugin)
 * [permissionsPlugin](#permissionsplugin)

For this README, let's require the module as
```javascript
var authorize = require('mongoose-authorize');
```

## teamPlugin
 * organize users in teams
 * teams can be nested arbitrarily (cycles are properly handled)

Let's take the following simple model of a user:
```javascript
mongoose.model('User', new mongoose.Schema({name: String}));
```
Yours may be arbitrarily more complex, e.g., you may want to store a password hash in order to authenticate users.

Now assume you want to organize users in teams. Let's create a team model with the `teamPlugin`:
```javascript
var teamSchema = new mongoose.Schema({name: String});
teamSchema.plugin(authorize.teamPlugin);
mongoose.model('Team', teamSchema);
```

So let's create an actual user and a team by filling the `members.users` and `members.teams` properties:
```javascript
var async = require('async'); // makes code more readable

async.waterfall([
  // create a user
  function (cb) {
    mongoose.model('User').create({name: 'hondanz'}, {name: 'halligalli'}, cb);
  },
  // create a team 'admins' with member user_hondanz
  function(user_hondanz, user_halligalli, cb) {
    mongoose.model('Team').create(
      {
        name: 'admins',
        members: {
          users: [user_hondanz],
          teams: []
        }
      },
      function (err, team_admins) {
        if (err) return cb(err);
        cb(null, user_halligalli, team_admins);
      }
    );
  },
  // create a team 'editors' with members user_halligalli and all members of team_admins
  function (user_halligalli, team_admins, cb) {
    mongoose.model('Team').create(
      {
        name: 'editors',
        members: {
          users: [user_halligalli],
          teams: [team_admins]
        }
      },
      cb
    );
  }],
  function (err) {
    if (err) return console.error(err);
    console.log('users and teams created');
  }
);
```

## permissionsPlugin
 * grant and check permissions for actions on ressources to teams
