const getBaseUrlFromTemplate = (template) => {
  const match = template.match(/(\{\{[A-Za-z0-9\.]*\}\})/gm);
  if (Array.isArray(match) && match.length !== 0) {
    return template
      .substr(0, template.indexOf(match[0]))
      .replace(/\/$/, '');
  }
  return template;
};

module.exports = function(RED) {
  'use strict';
  var bodyParser = require('body-parser');
  var multer = require('multer');
  var cookieParser = require('cookie-parser');
  var getBody = require('raw-body');
  var cors = require('cors');
  var onHeaders = require('on-headers');
  var typer = require('content-type');
  var mediaTyper = require('media-typer');
  var isUtf8 = require('is-utf8');
  const URL = require('url');
  const evaluateString = require('../../utils/evalute-string')(RED);

  function rawBodyParser(req, _res, next) {
    if (req.skipRawBodyParser) {
      next();
    } // don't parse this if told to skip
    if (req._body) {
      return next();
    }
    req.body = '';
    req._body = true;

    var isText = true;
    var checkUTF = false;

    if (req.headers['content-type']) {
      var contentType = typer.parse(req.headers['content-type']);
      if (contentType.type) {
        var parsedType = mediaTyper.parse(contentType.type);
        if (parsedType.type === 'text') {
          isText = true;
        } else if (
          parsedType.subtype === 'xml' ||
          parsedType.suffix === 'xml'
        ) {
          isText = true;
        } else if (parsedType.type !== 'application') {
          isText = false;
        } else if (
          parsedType.subtype !== 'octet-stream' &&
          parsedType.subtype !== 'cbor' &&
          parsedType.subtype !== 'x-protobuf'
        ) {
          checkUTF = true;
        } else {
          // application/octet-stream or application/cbor
          isText = false;
        }
      }
    }

    getBody(
      req,
      {
        length: req.headers['content-length'],
        encoding: isText ? 'utf8' : null,
      },
      function(err, buf) {
        if (err) {
          return next(err);
        }
        if (!isText && checkUTF && isUtf8(buf)) {
          buf = buf.toString();
        }
        req.body = buf;
        next();
      }
    );
  }

  function createResponseWrapper(node, res) {
    var wrapper = {
      _res: res,
    };
    var toWrap = [
      'append',
      'attachment',
      'cookie',
      'clearCookie',
      'download',
      'end',
      'format',
      'get',
      'json',
      'jsonp',
      'links',
      'location',
      'redirect',
      'render',
      'send',
      'sendfile',
      'sendFile',
      'sendStatus',
      'set',
      'status',
      'type',
      'vary',
    ];
    toWrap.forEach(function(f) {
      wrapper[f] = function() {
        node.warn(
          RED._('httpin.errors.deprecated-call', { method: 'msg.res.' + f })
        );
        var result = res[f].apply(res, arguments);
        if (result === res) {
          return wrapper;
        } else {
          return result;
        }
      };
    });
    return wrapper;
  }

  var corsHandler = function(req, res, next) {
    next();
  };

  if (RED.settings.httpNodeCors) {
    corsHandler = cors(RED.settings.httpNodeCors);
    RED.httpNode.options('*', corsHandler);
  }

  function EnhancedHTTPIn(n) {
    RED.nodes.createNode(this, n);
    if (RED.settings.httpNodeRoot !== false) {
      if (!n.url) {
        this.warn(RED._('httpin.errors.missing-path'));
        return;
      }
      this.url = n.url;
      if (this.url[0] !== '/') {
        this.url = '/' + this.url;
      }

      this.method = n.method;
      this.upload = n.upload;
      this.variable = n.variable;
      this.variableType = n.variableType;
      this.swaggerDoc = n.swaggerDoc;

      var node = this;

      // eslint-disable-next-line no-unused-vars
      this.errorHandler = function(err, req, res, next) {
        node.warn(err);
        res.sendStatus(500);
      };

      this.callback = function(req, res) {
        var msgid = RED.util.generateId();
        res._msgid = msgid;
        if (node.method.match(/^(post|delete|put|options|patch)$/)) {
          node.send({
            _msgid: msgid,
            req: req,
            res: createResponseWrapper(node, res),
            payload: req.body,
          });
        } else if (node.method == 'get') {
          node.send({
            _msgid: msgid,
            req: req,
            res: createResponseWrapper(node, res),
            payload: req.query,
          });
        } else {
          node.send({
            _msgid: msgid,
            req: req,
            res: createResponseWrapper(node, res),
          });
        }
      };

      var httpMiddleware = function(req, res, next) {
        next();
      };

      if (RED.settings.httpNodeMiddleware) {
        if (
          typeof RED.settings.httpNodeMiddleware === 'function' ||
          Array.isArray(RED.settings.httpNodeMiddleware)
        ) {
          httpMiddleware = RED.settings.httpNodeMiddleware;
        }
      }

      var maxApiRequestSize = RED.settings.apiMaxLength || '5mb';
      var jsonParser = bodyParser.json({ limit: maxApiRequestSize });
      var urlencParser = bodyParser.urlencoded({
        limit: maxApiRequestSize,
        extended: true,
      });

      var metricsHandler = function(req, res, next) {
        next();
      };
      if (this.metric()) {
        metricsHandler = function(req, res, next) {
          var startAt = process.hrtime();
          onHeaders(res, function() {
            if (res._msgid) {
              var diff = process.hrtime(startAt);
              var ms = diff[0] * 1e3 + diff[1] * 1e-6;
              var metricResponseTime = ms.toFixed(3);
              var metricContentLength = res.getHeader('content-length');
              //assuming that _id has been set for res._metrics in HttpOut node!
              node.metric(
                'response.time.millis',
                { _msgid: res._msgid },
                metricResponseTime
              );
              node.metric(
                'response.content-length.bytes',
                { _msgid: res._msgid },
                metricContentLength
              );
            }
          });
          next();
        };
      }

      var multipartParser = function(req, res, next) {
        next();
      };
      if (this.upload) {
        var mp = multer({ storage: multer.memoryStorage() }).any();
        multipartParser = function(req, res, next) {
          mp(req, res, function(err) {
            req._body = true;
            next(err);
          });
        };
      }

      // skip middleware
      const mw = function(req, _res, next) {
        const cmpUrl = evaluateString(node.url, { node });

        // parse incoming url, remove queries
        const parsedUrl = URL.parse(req.url);
        const calledUrl = parsedUrl.pathname;
        // compare and skip to next or to next middleware chain
        if (calledUrl === cmpUrl) {
          next();
        } else {
          next('route');
        }
      };

      // get base url, is the url before any variable part, the middleware is listening
      // to this fixed base url and computing the url to match at every request
      const baseURL = getBaseUrlFromTemplate(this.url);

      // if the parsed url is the same as the initial url (not same instance, it's copied)
      // then there are not variables and the url match must be exact or it's risking to match
      // too many inbound calls
      // eslint-disable-next-line security/detect-non-literal-regexp
      node.matchPath = new RegExp(
        `^${baseURL}${baseURL == node.url ? '$' : ''}`
      );

      if (this.method == 'get') {
        RED.httpNode.get(
          node.matchPath,
          mw,
          cookieParser(),
          httpMiddleware,
          corsHandler,
          metricsHandler,
          this.callback,
          this.errorHandler
        );
      } else if (this.method == 'post') {
        RED.httpNode.post(
          node.matchPath,
          mw,
          cookieParser(),
          httpMiddleware,
          corsHandler,
          metricsHandler,
          jsonParser,
          urlencParser,
          multipartParser,
          rawBodyParser,
          this.callback,
          this.errorHandler
        );
      } else if (this.method == 'put') {
        RED.httpNode.put(
          node.matchPath,
          mw,
          cookieParser(),
          httpMiddleware,
          corsHandler,
          metricsHandler,
          jsonParser,
          urlencParser,
          rawBodyParser,
          this.callback,
          this.errorHandler
        );
      } else if (this.method == 'patch') {
        RED.httpNode.patch(
          node.matchPath,
          mw,
          cookieParser(),
          httpMiddleware,
          corsHandler,
          metricsHandler,
          jsonParser,
          urlencParser,
          rawBodyParser,
          this.callback,
          this.errorHandler
        );
      } else if (this.method == 'delete') {
        RED.httpNode.delete(
          node.matchPath,
          mw,
          cookieParser(),
          httpMiddleware,
          corsHandler,
          metricsHandler,
          jsonParser,
          urlencParser,
          rawBodyParser,
          this.callback,
          this.errorHandler
        );
      }

      this.on('close', function() {
        var node = this;
        RED.httpNode._router.stack.forEach(function(route, i, routes) {
          // remove based on the regular expression instance
          if (route.regexp === node.matchPath) {
            routes.splice(i, 1);
          }
        });
      });
    } else {
      this.warn(RED._('httpin.errors.not-created'));
    }
  }
  RED.nodes.registerType('enhanced-http-in', EnhancedHTTPIn);
};
