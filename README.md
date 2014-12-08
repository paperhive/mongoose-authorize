# mongoose-authorize [![Build Status](https://travis-ci.org/paperhub/mongoose-authorize.svg)](https://travis-ci.org/paperhub/mongoose-authorize) [![Dependency Status](https://gemnasium.com/paperhub/mongoose-authorize.svg)](https://gemnasium.com/paperhub/mongoose-authorize)

An **authorization** (*not* authentication) plugin for mongoose. It offers the following plugins:

 * [teamPlugin](#teamplugin)
 * [permissionsPlugin](#permissionsplugin)

## teamPlugin
 * organize users in teams
 * teams can be nested arbitrarily (cycles are properly handled)

## permissionsPlugin
 * grant and check permissions for actions on ressources to teams
