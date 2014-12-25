# mongoose-authorize [![Build Status](https://travis-ci.org/paperhub/mongoose-authorize.svg)](https://travis-ci.org/paperhub/mongoose-authorize) [![Dependency Status](https://gemnasium.com/paperhub/mongoose-authorize.svg)](https://gemnasium.com/paperhub/mongoose-authorize)

An **authorization** (*not* authentication) plugin for mongoose.

Usually not all fields of a document in your database are supposed to be read
or written by all users of your application. This authorization plugin allows
you to

 * group your schema fields into components
 * specify permissions: which components can be accessed by whom (either
   statically or dynamically and user-configurable in your documents)
 * organize multiple users in teams
 * serialize a mongoose document: get all fields for which a user has read
   access (also takes care of nested schemas and populated referenced documents)
 * verify and set user-provided data in a mongoose document: only set the fields
   for which a user has write access (note: work in progress)

The permission module in `mongoose-authorize` can be seen as a
*role-based access control (RBAC)* system. Unlike other modules (e.g.,
[mongoose-rbac](https://github.com/bryandragon/mongoose-rbac)), the permissions
in `mongoose-authorize` do not have to be specified globally (e.g., inside the
user model) but can be maintained inside other entities such as organizations.

## Example

The core idea of `mongoose-authorize` is to split a mongoose schema into
*components* for which you can then define permissions. Let's take a look at
the following example:
```javascript
var userSchema = new mongoose.Schema({
  name: {type: String, component: 'info'},
  passwordHash: String,
  father: {type: mongoose.Schema.Types.ObjectId, ref: 'User', component: 'info'},
  settings: {
    rememberMe: {type: Boolean, component: 'settings'}
  }
});
```
Here we have the two components:
 * *info*: can be read by everyone but only written by the owner
 * *settings*: can only be read and written by the owner

This can be achieved with the `componentsPlugin`:
```javascript
var authorize = require('mongoose-authorize')();
userSchema.plugin(authorize.componentsPlugin, {
  permissions: {
    defaults: {read: ['info']},
    fromFun: function (doc, userId, action, done) {
      // owner has full access to info and settings
      if (doc._id.equals(userId)) return done(null, ['info', 'settings']);
      // otherwise: no access (except the defaults specified above)
      done(null, []);
    }
  }
});
```

Let's create the model and add two users:
```javascript
mongoose.model('User', userSchema).create(
  {name: 'Luke', passwordHash: '0afb5c', settings: {rememberMe: true}},
  {name: 'Darth', passwordHash: 'd4c18b', settings: {rememberMe: false}},
  function (err, luke, darth) {
    luke.father = darth;
    luke.save(function (err, luke) { /* ... */ });
  }
);
```

In order to demonstrate this plugin's ability to properly process referenced
documents we populate Luke's `father` field:
```javascript
luke.populate('father', function (err, luke) { /* ... */ });
```

Let's assume that Luke is authenticated and wants to have a JSON-representation
of himself:
```javascript
luke.authorizedToJSON(luke._id, function (err, json) {
  console.log(json);
});
```
Result:
```javascript
{ name: 'Luke',
  settings: { rememberMe: true },
  father: { name: 'Darth', _id: '549af64bd25236066b30dbe1' },
  _id: '549af64bd25236066b30dbe0' }
```

Now let's assume that Darth is authenticated and wants to have a
JSON-representation of his son:
```javascript
luke.authorizedToJSON(darth._id, function (err, json) {
  console.log(json);
});
```
Result:
```javascript
{ name: 'Luke',
  father:
   { name: 'Darth',
     settings: { rememberMe: false },
     _id: '549af64bd25236066b30dbe1' },
  _id: '549af64bd25236066b30dbe0' }
```
Note that Luke's settings are missing in Darth's representation. However, Darth
is allowed to see his own settings in the populated `father` field.


## Documentation

`mongoose-authorize` offers the following plugins:

 * [componentsPlugin](#componentsplugin)
 * [teamPlugin](#teamplugin)
 * [permissionsPlugin](#permissionsplugin)


### componentsPlugin

TODO

### teamPlugin
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

### permissionsPlugin
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
