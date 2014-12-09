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
  // create a team 'readers' with members user_halligalli and all members of team_admins
  function (user_halligalli, team_admins, cb) {
    mongoose.model('Team').create(
      {
        name: 'readers',
        members: {
          users: [user_halligalli],
          teams: [team_admins]
        }
      },
      cb
    );
  }],
  function (err, team_readers) {
    if (err) return console.error(err);
    // use team_readers, e.g., team_readers.getUserIds(...), see below
  }
);
```
#### teamPlugin.getUserIds(callback)
Because teams may have users *and* teams as members, the team plugin offers `getUserIds` to get a flat array of all members' userIds.

 * `callback(err, userIds)` where userIds is an array of all members' userIds (includes members of nested teams).

##### Example
```javascript
team_readers.getUserIds(function (err, userIds) {
  if (err) return console.error(err);
  // userIds now contains: [user_halligalli._id, user_hondanz._id]
});
```

## permissionsPlugin
 * grant and check permissions for actions on ressources to teams

Assume you store articles and you want to grant permissions on this article. Let's use the `permissionsPlugin` for this:
```javascript
var articleSchema = new mongoose.Schema({title: String, body: String});
articleSchema.plugin(authorize.permissionsPlugin);
mongoose.model('Article', articleSchema);
```
Now we can create an article and assign permissions for the teams created above by filling the property `permissions`:
```javascript
mongoose.model('Article').create(
  {
    title: 'most interesting article ever',
    body: 'lorem ipsum',
    permissions: [
      {team: team_readers, action: 'read', ressource: 'body'},
      {team: team_admins, action: 'write', ressource: 'body'}
    ]
  },
  function (err, article) {
    if (err) return console.error(err);
    // use article, e.g., article.getPermissions() or
    // article.hasPermissions(userId, action, ressource), see below
  }
);
```

#### permissionsPlugin.getPermissions(callback)

Returns an array of all permissions with flattened userIds.

 * `callback(err, permissions)` where permissions is an array of permissions, each having the properties
    * `userIds`: the provided team is resolved to userIds via [teamPlugin.getUserIds](#teamplugingetuseridscallback)
    * `action`: the string as provided in the permission
    * `ressource`: the string as provided in the permission

##### Example
```javascript
article.getPermissions(function (err, permissions) {
  if (err) return console.error(err);
  /* permissions contains:
    [
      {userIds: [user_halligalli._id, user_hondanz._id], action: 'read', ressource: 'body'},
      {userIds: [user_hondanz._id], action: 'write', ressource: 'body'},
    ]
  */
});
```

#### permissionsPlugin.hasPermissions(userId, action, ressource, callback)

 * `userId`: a userId string
 * `action`: a string
 * `ressource`: a string
 * `callback(err, granted)`: `granted` is true if and only if the provided user has the permission to perform the specified action on the specified ressource.

##### Example
```javascript
article.hasPermissions(user_halligalli._id, 'write', 'body', function (err, granted) {
  if (err) return console.error(err);
  // granted is false
});
article.hasPermissions(user_hondanz._id, 'read', 'body', function (err, granted) {
  if (err) return console.error(err);
  // granted is true
});
```
