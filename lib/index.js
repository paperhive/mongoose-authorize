var _ = require('lodash');

module.exports = function (config) {
  config = _.defaults(_.clone(config || {}), {
    permissions: 'permissions',
    permissionsGet: 'getPermissions',
    permissionsHas: 'hasPermissions',
    permissionsAssert: 'assertPermission',
    permissionsGetRessources: 'getRessources',
    teamMembers: 'members',
    teamGetUserIds: 'getUserIds',
    teamUserModel: 'User',
    teamModel: 'Team'
  });
  return {
    cloneWhitelisted: require('./cloneWhitelisted'),
    permissionsPlugin: require('./permissionsPlugin')(config),
    ressourcePlugin: require('./ressourcePlugin')(config),
    teamPlugin: require('./teamPlugin')(config)
  };
};
