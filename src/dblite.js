/**
var db = require('./src/dblite.js')('./test/dblite.test.sqlite');
db.on('info', console.log.bind(console));
db.on('error', console.error.bind(console));
*/

var
  isArray = Array.isArray,
  EventEmitter = require('events').EventEmitter,
  EOL = require('os').EOL,
  spawn = require('child_process').spawn,
  config = {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe']
  },
  doubleQuotes = /""/g,
  SELECT = /^(?:select|SELECT|pragma|PRAGMA) /,
  INSERT = /^(?:insert|INSERT) /,
  //BEGIN = /^(?:begin|BEGIN)(?: |$)/,
  //COMMIT = /^(?:commit|COMMIT|end transaction|END TRANSACTION)(?: |$)/,
  SANITIZER = new RegExp("[;" + EOL.split('').map(function(c) {
    return '\\x' + ('0' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join('') + "]+$"),
  SANITIZER_REPLACER = ';' + EOL,
  REPLACE_QUESTIONMARKS = /\?/g,
  REPLACE_PARAMS = /(?:\:|\@|\$)([a-zA-Z_$]+)/g,
  SINGLE_QUOTES = /'/g,
  SINGLE_QUOTES_DOUBLED = "''",
  HAS_PARAMS = /(?:\?|(?:(?:\:|\@|\$)[a-zA-Z_$]+))/,
  log = console.log.bind(console),
  paramsIndex,
  paramsArray,
  paramsObject
;

function dblite() {
  function onerror(data) {
    console.error('' + data);
    self.emit('error', data);
  }
  var
    self = new EventEmitter(),
    wasASelect = false,
    program = spawn(
      dblite.bin || 'sqlite3',
      Array.prototype.slice.call(arguments).concat('-csv'),
      config
    ),
    $callback,
    $fields;
  program.stderr.on('data', onerror);
  program.stdin.on('error', onerror);
  program.stdout.on('error', onerror);
  program.stderr.on('error', onerror);
  program.stdout.on('data', function (data) {
    var result;
    if (wasASelect) {
      if ($callback) {
        result = parseCVS('' + data);
        $callback.call(self, $fields ? (
            isArray($fields) ?
              result.map(row2object, $fields) :
              result.map(row2parsed, parseFields($fields))
          ) :
          result
        );
      }
    } else {
      self.emit('info', '' + data);
    }
  });
  program.on('close', function (code) {
    self.emit('close', code);
  });
  program.unref();
  self.close = function() {
    program.stdin.end();
    program.kill();
  };
  self.lastRowID = function(table, callback) {
    self.query(
      'SELECT ROWID FROM `' + table + '` ORDER BY ROWID DESC LIMIT 1',
      function(result){
        (callback || log)(result[0][0]);
      }
    );
  };
  self.query = function(string, params, fields, callback) {
    wasASelect = SELECT.test(string);
    if (wasASelect) {
      switch(arguments.length) {
        case 4:
          $callback = callback;
          $fields = fields;
          string = replaceString(string, params);
          break;
        case 3:
          $callback = fields;
          if (HAS_PARAMS.test(string)) {
            $fields = null;
            string = replaceString(string, params);
          } else {
            $fields = params;
          }
          break;
        case 2:
          $callback = params;
          $fields = null;
          break;
        default:
          $callback = log;
          $fields = null;
          break;
      }
    } else if(HAS_PARAMS.test(string)) {
      string = replaceString(string, params);
    }
    program.stdin.write(wasASelect || string[0] !== '.' ?
      sanitize(string) :
      string + EOL
    );
  };
  return self;
}

function parseCVS(output) {
  for(var
    fields = [],
    rows = [],
    index = 0,
    rindex = 0,
    length = output.length,
    i = 0,
    j, loop,
    current,
    endLine,
    iNext,
    str;
    i < length; i++
  ) {
    switch(output[i]) {
      case '"':
        loop = true;
        j = i;
        do {
          iNext = output.indexOf('"', current = j + 1);
          switch(output[j = iNext + 1]) {
            case ',':
            case EOL:
              loop = false;
              break;
          }
        } while(loop);
        str = output.slice(i + 1, iNext++).replace(doubleQuotes, '"');
        break;
      default:
        iNext = output.indexOf(',', i);
        endLine = output.indexOf(EOL, i);
        str = output.slice(i, iNext = endLine < iNext ?
          endLine : (
            iNext < 0 ?
              length - 1 :
              iNext
          )
        );
        break;
    }
    fields[index++] = str;
    i = iNext;
    if (output[i] === EOL) {
      rows[rindex++] = fields;
      fields = [];
      index = 0;
    }
  }
  return rows;
}

function parseFields($fields) {
  for (var
    fields = Object.keys($fields),
    parsers = [],
    length = fields.length,
    i = 0; i < length; i++
  ) {
    parsers[i] = fields[i];
  }
  return {f: fields, p: parsers};
}

function replaceString(string, params) {
  if (isArray(params)) {
    paramsIndex = 0;
    paramsArray = params;
    string = string.replace(REPLACE_QUESTIONMARKS, replaceQuestions);
  } else {
    paramsObject = params;
    string = string.replace(REPLACE_PARAMS, replaceParams);
  }
  paramsArray = paramsObject = null;
  return string;
}

function replaceParams(match, key) {
  return safer(paramsObject[key]);
}

function replaceQuestions() {
  return safer(paramsArray[paramsIndex++]);
}

function row2object(row) {
  for (var
    out = {},
    length = this.length,
    i = 0; i < length; i++
  ) {
    out[this[i]] = row[i];
  }
  return out;
}

function row2parsed(row) {
  for (var
    out = {},
    fields = this.f,
    parsers = this.p,
    length = fields.length,
    i = 0; i < length; i++
  ) {
    out[fields[i]] = parsers[i](row[i]);
  }
  return out;
}

function safer(what) {
  switch (typeof what) {
    case 'object':
      what = JSON.stringify(what);
      /* falls through */
    case 'string':
      return "'" + what.replace(SINGLE_QUOTES, SINGLE_QUOTES_DOUBLED) + "'";
    case 'boolean':
      return what ? '1' : '0';
    case 'number':
      if (isFinite(what)) return what;
  }
  throw new Error('unsupported data');
}

function sanitize(string) {
  return string.replace(SANITIZER, '') + SANITIZER_REPLACER;
}

/*
function transaction(string, i, arr) {
  string = sanitize(string);
  if (i === 0 && !BEGIN.test(string)) {
    string = 'BEGIN TRANSACTION;' + EOL + string;
  } else if(i === arr.length - 1 && !COMMIT.test(string)) {
    string += 'COMMIT;' + EOL;
  }
  return string;
}
*/

dblite.bin = 'sqlite3';

module.exports = dblite;

// db.query('PRAGMA table_info(kvp)', console.log.bind(console));
// http://www.sqlite.org/pragma.html