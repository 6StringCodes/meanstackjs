module.exports = Mean
var auto = require('run-auto')
var debug = require('debug')('meanstackjs:server')
var fs = require('fs')
var glob = require('glob')
var https = require('https')
var mongoose = require('mongoose')
var Promise = require('bluebird')
var _ = require('lodash')
var run = require('./run.js')

function Mean (opts, done) {
  var self = this
  self.dir = __dirname
  self.opts = opts
  self.run = run
  self.environment = require('./configs/environment.js').get()
  self.settings = require('./configs/settings.js').get()
  self.port = self.opts.port || self.settings.http.port
  self.middleware = require('./server/middleware.js')
  self.mail = require('./server/mail.js')
  self.register = require('./server/register.js')

  // Start of the build process
  // setupExpressConfigs > Used to set up expressjs initially, middleware & passport.
  require('./server/config.js')(self)
  // setupExpressErrorHandler > Used to set up our customer error handler in the server folder.
  require('./server/error.js')(self)
  // setupExpressSecurity > Used to set up helmet, hpp, cors & content length.
  require('./server/security.js')(self)
  // setupExpressHeaders > Used to set up the headers that go out on every route.
  require('./server/headers.js')(self)
  // setupExpressLogger > Used to set up our morgan logger & debug statements on all routes.
  require('./server/logger.js')(self)
  // setupTools > Used to set up every tool in the tools directory.
  var files = glob.sync('./tools/*/package.json')
  files.forEach(function (n, k) {
    var packageInfo = require(n)
    if (packageInfo.active || _.isUndefined(packageInfo.active)) {
      var mainPath = _.replace(n, 'package.json', packageInfo.main)
      require(mainPath)(self)
    }
  })
  // setupStaticRoutes > Used to set up all system static routes including the main '/*' route with ejs templating.
  require('./server/routes.js')(self)
  // purgeMaxCdn - *** OPTIONAL ***  > Used to purge the max cdn cache of the file. We Support MAXCDN
  require('./server/cdn.js')(self)
  // auto  - connectMongoDb :  server > Used to finsh the final set up of the server. at the same time we start connecting to mongo and turning on the server.
  auto({
    connectMongoDb: function (callback) {
      mongoose.Promise = Promise
      mongoose.set('debug', self.settings.mongodb.debug)
      mongoose.connect(self.settings.mongodb.uri, self.settings.mongodb.options)

      mongoose.connection.on('error', function (err) {
        console.log('MongoDB Connection Error. Please make sure that MongoDB is running.')
        debug('MongoDB Connection Error ')
        callback(err, null)
      })

      mongoose.connection.on('open', function () {
        debug('MongoDB Connection Open ')
        callback(null, {
          db: self.settings.mongodb.uri,
          dbOptions: self.settings.mongodb.options
        })
      })
    },
    server: function (callback) {
      if (self.settings.https.active) {
        https.createServer({
          key: fs.readFileSync(self.settings.https.key),
          cert: fs.readFileSync(self.settings.https.cert)
        }, self.app).listen(self.settings.https.port, function () {
          console.log('HTTPS Express server listening on port %d in %s mode', self.settings.https.port, self.app.get('env'))
          debug('HTTPS Express server listening on port %d in %s mode', self.settings.https.port, self.app.get('env'))
          if (!self.settings.http.active) {
            callback(null, {
              port: self.app.get('port'),
              env: self.app.get('env')
            })
          }
        })
      }

      // check if you set both to false we default to turn on http
      if (self.settings.http.active || (self.settings.https.active === false) === (self.settings.http.active === false)) {
        self.app.listen(self.app.get('port'), function () {
          console.log('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
          debug('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
          callback(null, {
            port: self.app.get('port'),
            env: self.app.get('env')
          })
        })
      }
    }
  },
    function (err, results) {
      if (err) {
        console.log('Exiting because of error %d', err)
        debug('Exiting because of error %d', err)
        process.exit(1)
      }

      debug('Finished Server Load')
      done(null)
    })
}

if (!module.parent) {
  run(Mean)
}
