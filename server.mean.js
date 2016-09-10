module.exports = Mean
var auth = require('./server/passport.js')
var auto = require('run-auto')
var bodyParser = require('body-parser')
var chalk = require('chalk')
var chokidar = require('chokidar')
var cookieParser = require('cookie-parser')
var cors = require('cors')
var compress = require('compression')
var ejs = require('ejs')
var contentLength = require('express-content-length-validator')
var express = require('express')
var expressValidator = require('express-validator')
var flash = require('express-flash')
var fs = require('fs')
var helmet = require('helmet')
var hpp = require('hpp')
var https = require('https')
var less = require('less')
var logger = require('morgan')
var MaxCDN = require('maxcdn')
var methodOverride = require('method-override')
var mongoose = require('mongoose')
var path = require('path')
var passport = require('passport')
var Promise = require('bluebird')
var sass = require('node-sass')
var seo = require('mean-seo')
var session = require('express-session')
var status = require('express-system-status')
var _ = require('lodash')

// Requires Something from Above
var MongoStore = require('connect-mongo')(session)

function Mean (opts, done) {
  var self = this
  self.opts = opts
  self.debug = require('debug')('meanstackjs:server')
  self.setupEnv()
  self.setupExpressConfigs()
  self.setupExpressSecurity()
  self.setupHeaders()
  if (self.settings.logger)self.setupLogger()
  if (self.settings.swagger)self.swagger()
  if (self.settings.agendash.active) self.agenda()
  if (self.environment === 'development') {
    self.nightwatch()
    self.plato()
  }
  self.livereload()
  self.setupRoutesMiddleware()
  self.setupErrorHandling()
  self.setupStatic()
  if (self.settings.maxcdn.zoneId)self.purgeMaxCdn()
  auto({
    connectMongoDb: function (callback) {
      mongoose.Promise = Promise
      mongoose.set('debug', self.settings.mongodb.debug)
      mongoose.connect(self.settings.mongodb.uri, self.settings.mongodb.options)
      mongoose.connection.on('error', function (err) {
        console.log('MongoDB Connection Error. Please make sure that MongoDB is running.')
        self.debug('MongoDB Connection Error ')
        callback(err, null)
      })
      mongoose.connection.on('open', function () {
        self.debug('MongoDB Connection Open ')
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
          self.debug('HTTPS Express server listening on port %d in %s mode', self.settings.https.port, self.app.get('env'))
          if (!self.settings.http.active) {
            callback(null, {
              port: self.app.get('port'),
              env: self.app.get('env')
            })
          }
        })
      }
      // OR - check if you set both to false we default to turn on http
      if (self.settings.http.active || (self.settings.https.active === false) === (self.settings.http.active === false)) {
        self.app.listen(self.app.get('port'), function () {
          console.log('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
          self.debug('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
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
        self.debug('Exiting because of error %d', err)
        process.exit(1)
      }
      done(null)
    })

  self.debug('Finished Server Load')
}

Mean.prototype.setupEnv = function () {
  var self = this
  self.environment = require('./configs/environment.js').get()
  self.settings = require('./configs/settings.js').get()
  self.dir = __dirname
}

Mean.prototype.setupExpressConfigs = function () {
  var self = this
  self.port = self.opts.port || self.settings.http.port
  self.debug('started')

  self.app = express()

  // Trust "X-Forwarded-For" and "X-Forwarded-Proto" nginx headers
  self.app.enable('trust proxy')

  // Disable "powered by express" header
  self.app.disable('x-powered-by')

  self.app.set('view engine', 'html')
  self.app.set('views', path.join(self.dir, '/client'))

  /**
   * Express configuration.
   */
  self.app.set('port', self.port)
  self.app.use(compress())
  self.app.use(bodyParser.json(self.settings.bodyparser.json))
  self.app.use(bodyParser.urlencoded(self.settings.bodyparser.urlencoded))
  self.app.use(
    expressValidator({ // https://github.com/chriso/validator.js#validators
      customValidators: {
        isArray: function (value) { // req.assert('param', 'Invalid Param').isArray()
          return _.isObject(value)
        },
        isObject: function (value) { // req.assert('param', 'Invalid Param').isObject()
          return _.isObject(value)
        },
        isString: function (value) { // req.assert('param', 'Invalid Param').isString()
          return _.isString(value)
        },
        isRegExp: function (value) { // req.assert('param', 'Invalid Param').isRegExp()
          return _.isRegExp(value)
        },
        isEmpty: function (value) { // req.assert('param', 'Invalid Param').isEmpty()
          return _.isEmpty(value)
        },
        gte: function (param, num) { // req.assert('param', 'Invalid Param').gte(5)
          return _.gte(param, num)
        },
        lte: function (param, num) { // req.assert('param', 'Invalid Param').lte(5)
          return _.lte(param, num)
        },
        gt: function (param, num) { // req.assert('param', 'Invalid Param').gt(5)
          return _.gt(param, num)
        },
        lt: function (param, num) { // req.assert('param', 'Invalid Param').lt(5)
          return _.lt(param, num)
        }
      },
      customSanitizers: {
        toArray: function (value) { // req.sanitize('postparam').toArray()
          return _.toArray(value)
        },
        toFinite: function (value) { // req.sanitize('postparam').toFinite()
          return _.toFinite(value)
        },
        toLength: function (value) { // req.sanitize('postparam').toLength()
          return _.toLength(value)
        },
        toPlainObject: function (value) { // req.sanitize('postparam').toPlainObject()
          return _.toPlainObject(value)
        },
        toString: function (value) { // req.sanitize('postparam').toString()
          return _.toString(value)
        }
      },
      errorFormatter: function (param, msg, value) {
        var namespace = param.split('.')
        var root = namespace.shift()
        var formParam = root

        while (namespace.length) {
          formParam += '[' + namespace.shift() + ']'
        }
        return {
          param: formParam,
          msg: msg,
          value: value
        }
      }
    })
  )
  self.app.use(methodOverride())
  self.app.use(cookieParser())
  self.app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: self.settings.sessionSecret,
    store: new MongoStore({
      url: self.settings.mongodb.uri,
      autoReconnect: true
    })
  }))
  self.app.use(passport.initialize())
  self.app.use(passport.session())
  passport.serializeUser(auth.serializeUser)
  passport.deserializeUser(auth.deserializeUser)
  passport.use(auth.passportStrategy)
  self.app.use(flash())
}
Mean.prototype.setupExpressSecurity = function () {
  var self = this
  // 7 security middleware
  self.app.use(helmet(self.settings.bodyparser.helmet))
  // 3 security middleware
  // self.app.use(helmet.contentSecurityPolicy())
  // self.app.use(helmet.hpkp())
  // self.app.use(helmet.noCache())
  // HTTP Parameter Pollution attacks
  self.app.use(hpp())
  // CORS
  // var whitelist = ['http://example1.com', 'http://example2.com']
  // var corsOptions = {
  //   origin: function (origin, callback) {
  //     var originIsWhitelisted = whitelist.indexOf(origin) !== -1
  //     callback(null, originIsWhitelisted)
  //   }
  // }
  // self.app.use(cors(corsOptions))
  self.app.use(cors())
  // CORS PREFLIGHT OPTIONS
  // app.options('*', cors()) // include before other routes
  // Validate MAX_CONTENT_LENGTH_ACCEPTED
  var MAX_CONTENT_LENGTH_ACCEPTED = 9999
  self.app.use(contentLength.validateMax({max: MAX_CONTENT_LENGTH_ACCEPTED, status: 400, message: 'Please make a small payload'}))
// ENFORCE SSL
// var express_enforces_ssl = require('express-enforces-ssl')
// self.app.use(express_enforces_ssl())
// LIMIT CALLS
// var client = require('redis').createClient()
// var limiter = require('express-limiter')(self.app, client)
// limiter({
//   path: '/api/',
//   method: 'get',
//   lookup: ['connection.remoteAddress'],
//   // 150 requests per hour
//   total: 150,
//   expire: 1000 * 60 * 60
// })
}

Mean.prototype.setupHeaders = function () {
  var self = this
  self.app.use(function (req, res, next) {
    // var extname = path.extname(url.parse(req.url).pathname)

    // // Add cross-domain header for fonts, required by spec, Firefox, and IE.
    // if (['.eot', '.ttf', '.otf', '.woff', '.woff2'].indexOf(extname) >= 0) {
    //   res.header('Access-Control-Allow-Origin', '*')
    // }

    // Prevents IE and Chrome from MIME-sniffing a response to reduce exposure to
    // drive-by download attacks when serving user uploaded content.
    res.header('X-Content-Type-Options', 'nosniff')

    // Prevent rendering of site within a frame
    res.header('X-Frame-Options', 'DENY')

    // Enable the XSS filter built into most recent web browsers. It's usually
    // enabled by default anyway, so role of this headers is to re-enable for this
    // particular website if it was disabled by the user.
    res.header('X-XSS-Protection', '1; mode=block')

    // Force IE to use latest rendering engine or Chrome Frame
    res.header('X-UA-Compatible', 'IE=Edge,chrome=1')

    next()
  })
}

Mean.prototype.setupLogger = function () {
  var self = this
  self.app.use(logger(self.settings.logger))
  self.app.use(function (req, res, next) {
    // Log requests using the "debug" module so that the output is hidden by default.
    // Enable with DEBUG=* environment variable.
    self.debug(req.method + ' ' + req.originalUrl + ' ' + req.ip)
    next()
  })
}
Mean.prototype.swagger = function () {
  var self = this
  var Swagger = require('swagger-node-express')
  var swaggerUI = require('swagger-ui')
  self.app.use('/api' + '/index.html', handleIndex)
  self.app.use('/api' + '/', handleIndex)
  self.app.use('/api', express.static(swaggerUI.dist))
  var html
  function handleIndex (req, res, next) {
    if (req.url !== '/' && req.url !== '/index.html') {
      return next()
    }
    if (req.originalUrl === '/api') {
      return res.redirect(301, '/api' + '/')
    }
    if (html) {
      return res.send(html)
    }
    fs.readFile(swaggerUI.dist + '/index.html', {
      encoding: 'utf8'
    }, function (err, data) {
      if (err) {
        console.error(err)
        return res.send(500)
      }
      html = data.replace('http://petstore.swagger.io/v2/swagger.json', '/api-docs')
      res.send(html)
    })
  }
  var swagger = Swagger.createNew(self.app)

  var paramTypes = swagger.paramTypes
  var sortParm = paramTypes.query('sort', 'Comma seperated list of params to sort by.  (e.g "-created,name") ', 'string')
  var limitParm = paramTypes.query('limit', 'Number of items to return', 'number')
  var skipParm = paramTypes.query('skip', 'Number of items to skip', 'number')

  var defaultGetParams = [
    sortParm,
    limitParm,
    skipParm
  ]

  var swaggerPath = path.resolve(self.dir, './server/swagger')
  if (!fs.existsSync(swaggerPath)) {
    throw new Error('Critical Folder Missing:')
  }
  var swaggerDir = _.filter(fs.readdirSync(swaggerPath), function (n) {
    return !_.startsWith(n, '.')
  })
  _.forEach(swaggerDir, function (n) {
    var model = require(path.join(self.dir, '/server/swagger/', n, '/models'))
    swagger.addModels(model)
    require(path.join(self.dir, '/server/swagger/', n, '/services'))
      .load(swagger, {
        searchableOptions: defaultGetParams
      })
  })
  swagger.configureSwaggerPaths('', '/api-docs', '')
  swagger.configureDeclaration('Meanstackjs', {
    description: 'Meanstackjs API',
    authorizations: [''],
    produces: ['application/json']
  })
  swagger.setApiInfo({
    title: 'Meanstackjs',
    description: 'Meanstackjs API',
    termsOfServiceUrl: 'http://meanstackjs.com',
    contact: 'info@meanstackjs.com',
    licenseUrl: 'http://en.wikipedia.org/wiki/MIT_License'
  })
  swagger.setAuthorizations({
    apiKey: {
      type: 'apiKey',
      passAs: 'header'
    }
  })
  swagger.configure('/api', '1.0')
}
Mean.prototype.nightwatch = function () {
  var self = this
  self.app.use('/e2e', express.static(path.join(self.dir, 'reports/nightwatch/')))
}
Mean.prototype.plato = function () {
  var self = this
  self.app.use('/plato', express.static(path.join(self.dir, 'reports/plato')))
  require('./reports/plato.js').report(self.settings.plato)
}
Mean.prototype.agenda = function () {
  var Agenda = require('agenda')
  var Agendash = require('agendash')
  var backup = require('mongodb-backup')
  var restore = require('mongodb-restore')
  var self = this
  self.agenda = new Agenda(self.settings.agendash.options)
  if (!fs.existsSync(self.dir + '/backups/')) {
    fs.mkdirSync(self.dir + '/backups/')
  }
  self.agenda.define('backup', function (job, done) {
    var db = {}
    if (!fs.statSync(path.join(__dirname, 'backups/'))) done('No Root Directory ')
    if (job.attrs.data.uri) db.uri = job.attrs.data.uri
    else done('No URI was passed')
    if (job.attrs.data.collections) db.collections = job.attrs.data.collections
    try {
      backup(db)
    } catch (err) {
      done(err)
    }
    done()
  })
  self.agenda.define('restore', function (job, done) {
    var db = {}
    if (!fs.statSync(path.join(__dirname, 'backups/'))) done('No Root Directory ')
    if (job.attrs.data.uri) db.uri = job.attrs.data.uri
    else done('No URI was passed')
    try {
      restore(db)
    } catch (err) {
      done(err)
    }
    done()
  })
  self.agenda.on('ready', function () {
    // //every 3 mins or every minute
    // self.agenda.every('3 minutes', 'restore')
    // self.agenda.every('*/1 * * * *', 'backup')
    self.agenda.start()
  })
  self.app.use('/agenda', /*  require('./server/middleware.js').isAdmin, */ Agendash(self.agenda))
}
Mean.prototype.livereload = function () {
  var self = this
  /**
   * Livereload
   */
  if (self.environment === 'development') {
    var scssLessWatcher = chokidar.watch('file, dir, glob, or array', {
      ignored: /[\/\\]\./,
      persistent: true
    })
    var scssLessGlobalWatcher = chokidar.watch('file, dir, glob, or array', {
      ignored: /[\/\\]\./,
      persistent: true
    })
    scssLessWatcher.on('add', function (url) {
      // console.log(url)
    })
    scssLessWatcher.on('change', function (url) {
      var fileData = _.words(url, /[^./ ]+/g)
      if (fileData[fileData.length - 1] === 'less') {
        var lessContents = fs.readFileSync(path.resolve(url), 'utf8')
        less.render(lessContents, function (err, result) {
          if (err) {
            console.log(chalk.red(err))
          }
          fs.writeFileSync(path.resolve('./client/styles/compiled/' + fileData[fileData.length - 3] + '.' + fileData[fileData.length - 2] + '.' + fileData[fileData.length - 1] + '.css'), result.css)
        })
        console.log(chalk.green('Recompiled LESS'))
      } else {
        console.log(url)
        var scssContents = fs.readFileSync(path.resolve(url), 'utf8')
        var result = sass.renderSync({
          includePaths: [path.join(self.dir, './client/modules'), path.join(self.dir, './client/styles'), path.join(self.dir, './client/bower_components/bootstrap-sass/assets/stylesheets'), path.join(self.dir, './client/bower_components/Materialize/sass'), path.join(self.dir, './client/bower_components/foundation/scss'), path.join(self.dir, './client/bower_components/font-awesome/scss')],
          data: scssContents
        })
        fs.writeFileSync(path.resolve('./client/styles/compiled/' + fileData[fileData.length - 3] + '.' + fileData[fileData.length - 2] + '.' + fileData[fileData.length - 1] + '.css'), result.css)
        console.log(chalk.green('Recompiled SCSS'))
      }
    })
    scssLessGlobalWatcher.on('change', function (url) {
      var fileData = _.words(url, /[^./ ]+/g)
      if (fileData[fileData.length - 1] === 'less') {
        var lessContents = fs.readFileSync(path.resolve(url), 'utf8')
        less.render(lessContents, function (err, result) {
          if (err) {
            console.log(chalk.red(err))
          }
          fs.writeFileSync(path.resolve('./client/styles/compiled/' + fileData[fileData.length - 3] + '.' + fileData[fileData.length - 2] + '.' + fileData[fileData.length - 1] + '.css'), result.css)
        })
        _.forEach(self.fileStructure.style.less, function (l, k) {
          var lessContents = fs.readFileSync(path.join(self.dir, l.orginal), 'utf8')
          less.render(lessContents, function (err, result) {
            if (err) {
              console.log(chalk.red(err))
            }
            fs.writeFileSync(path.join(self.dir, l.compiled), result.css)
          })
        })
        console.log(chalk.green('Recompiled LESS'))
      } else {
        // RENDER THE GLOBAL STYLE
        var globalContents = fs.readFileSync(path.join(self.dir, '/client/styles/global.style.scss'), 'utf8')
        var result = sass.renderSync({
          includePaths: [path.join(self.dir, './client/modules'), path.join(self.dir, './client/styles'), path.join(self.dir, './client/bower_components/bootstrap-sass/assets/stylesheets'), path.join(self.dir, './client/bower_components/Materialize/sass'), path.join(self.dir, './client/bower_components/foundation/scss'), path.join(self.dir, './client/bower_components/font-awesome/scss')],
          data: globalContents
        })
        fs.writeFileSync(path.join(self.dir, '/client/styles/compiled/global.style.css'), result.css)
        _.forEach(self.fileStructure.style.scss, function (s, k) {
          var scssContents = fs.readFileSync(path.join(self.dir, s.orginal), 'utf8')
          // PLACED includePaths: so that @import 'global-variables.styles.scss'; work properly
          var result = sass.renderSync({
            includePaths: [path.join(self.dir, './client/modules'), path.join(self.dir, './client/styles'), path.join(self.dir, './client/bower_components/bootstrap-sass/assets/stylesheets'), path.join(self.dir, './client/bower_components/Materialize/sass'), path.join(self.dir, './client/bower_components/foundation/scss'), path.join(self.dir, './client/bower_components/font-awesome/scss')],
            data: scssContents
          })
          fs.writeFileSync(path.join(self.dir, s.compiled), result.css)
        })
        console.log(chalk.green('Recompiled Global SCSS'))
      }
    })
    scssLessWatcher.add('./client/modules/*/*.less')
    scssLessWatcher.add('./client/modules/*/*.scss')
    scssLessGlobalWatcher.add('./client/*/*.less')
    scssLessGlobalWatcher.add('./client/*/*.scss')
  }
}

Mean.prototype.setupRoutesMiddleware = function () {
  var self = this
  /**
   * Middleware.
   */
  self.middleware = require('./server/middleware.js')
  self.build = require('buildreq')(self.settings.buildreq)
  self.app.use(self.build.queryMiddleware({mongoose: mongoose}))
  /**
   * Routes.
   */
  self.Register = require('./server/register.js')
  self.app.use(self.build.responseMiddleware({mongoose: mongoose}))
  self.fileStructure = self.Register({
    app: self.app,
    settings: self.settings,
    middleware: self.middleware
  })
  /**
   * Dynamic Routes / Manually enabling them . You can change it back to automatic in the settings
   * build.routing(app, mongoose) - if reverting back to automatic
   */

// self.build.routing({
//   mongoose: mongoose,
//   remove: ['users'],
//   middleware: {
//     auth: [self.middleware.verify, self.middleware.isAuthenticated]
//   }
// }, function (error, data) {
//   if (error) console.log(error)
//   _.forEach(data, function (m) {
//     self.debug('Route Built by NPM buildreq:', m.route)
//     self.app.use(m.route, m.app)
//   })
// })
}

Mean.prototype.setupErrorHandling = function () {
  var self = this
  require('./server/error.js')(self)
}
Mean.prototype.setupStatic = function () {
  var self = this

  self.app.use(express.static(path.join(self.dir, 'client/'), {
    maxAge: 31557600000
  }))
  if (self.environment === 'development') {
    self.app.use('/api/v1/status', // middleware.verify  if you want the api to be behind token based
      status({
        app: self.app,
        config: self.settings,
        auth: true,
        user: 'admin',
        pass: 'pass',
        extra: {
          environment: self.environment
        },
        mongoose: mongoose // Now Supporting Mongoose
      })
    )
  }
  /**
   * Primary Failover routes.
   */
  self.app.get('/api/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in api'
    })
  })
  self.app.get('/bower_components/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in bower_components'
    })
  })
  self.app.get('/images/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in images'
    })
  })
  self.app.get('/scripts/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in scripts'
    })
  })
  self.app.get('/styles/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in styles'
    })
  })
  self.app.get('/uploads/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in uploads'
    })
  })
  // Turning off sitemap unless you want it back on
  // var sitemap = require('express-sitemap')()
  // self.app.get('/sitemap', function (req, res) {
  //   res.send(sitemap.generate(self.app))
  // })

  self.app.use(seo({cacheClient: 'disk', cacheDuration: 1 * 24 * 60 * 60 * 1000}))
  /**
   * Primary app routes.
   */
  self.app.get('/*', function (req, res) {
    if (_.isUndefined(req.user)) {
      req.user = {}
      req.user.authenticated = false
    } else {
      req.user.authenticated = true
    }
    // took out user
    var html = self.settings.html
    if (self.settings.seo[req.path]) {
      if (self.settings.seo[req.path].title) html.title = self.settings.seo[req.path].title
      if (self.settings.seo[req.path].description) html.description = self.settings.seo[req.path].description
      if (self.settings.seo[req.path].keywords) html.keywords = self.settings.seo[req.path].keywords
    }
    ejs.renderFile(path.join(__dirname, './server/layout/index.html'), {
      html: html,
      assets: self.app.locals.frontendFilesFinal,
      environment: self.environment
    }, {
      cache: true
    }, function (err, str) {
      if (err)console.log(err)
      res.send(str)
    })
  })
}
Mean.prototype.purgeMaxCdn = function () {
  var self = this
  var maxcdn = new MaxCDN(
    self.settings.maxcdn.companyAlias,
    self.settings.maxcdn.consumerKey,
    self.settings.maxcdn.consumerSecret
  )
  // secret.maxcdn.zoneId ||
  maxcdn.del('zones/pull.json/' + self.settings.maxcdn.zoneId + '/cache', function (err, res) {
    console.log('MAXCDN: STATUS')
    if (err) {
      console.error('PURGE ERROR: ', err.stack || err.message || err)
      return
    } else if (res.code !== 200) {
      console.error('PURGE ERROR: ', res.code)
      return
    }
    console.log('PURGE SUCCESS')
  })
}

var run = require('./run.js')
if (!module.parent) {
  run(Mean)
}
