/*!
Copyright (C) 2013 by WebReflection

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
/*! a zero hassle wrapper for sqlite by Andrea Giammarchi !*/
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
  resultBuffer = [],
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
    program = spawn(
      dblite.bin || 'sqlite3',
      Array.prototype.slice.call(arguments).concat('-csv'),
      config
    ),
    queue = [],
    busy = false,
    $callback,
    $fields;
  program.stderr.on('data', onerror);
  program.stdin.on('error', onerror);
  program.stdout.on('error', onerror);
  program.stderr.on('error', onerror);
  function ondata() {
    var
      str = resultBuffer[resultBuffer.length - 1] || '',
      result,
      callback,
      fields
    ;
    if (str.slice(-EOL.length) === EOL) {
      result = parseCVS(resultBuffer.join(''));
      resultBuffer = [];
      busy = false;
      callback = $callback;
      fields = $fields;
      if (queue.length) {
        self.query.apply(self, queue.shift());
      } else {
        $callback = null;
      }
      if (callback) {
        callback.call(self, fields ? (
            isArray(fields) ?
              result.map(row2object, fields) :
              result.map(row2parsed, parseFields(fields))
          ) :
          result
        );
      }
    }
  }
  program.stdout.on('data', function (data) {
    if (busy) {
      resultBuffer.push('' + data);
      process.nextTick(ondata);
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
  // self.escape = escape;
  // special helper
  self.lastRowID = function(table, callback) {
    self.query(
      // 'SELECT last_insert_rowid() FROM ' + table // will not work as expected
      'SELECT ROWID FROM `' + table + '` ORDER BY ROWID DESC LIMIT 1',
      function(result){
        (callback || log)(result[0][0]);
      }
    );
  };
  self.query = function(string, params, fields, callback) {
    var wasASelect = SELECT.test(string);
    if (wasASelect) {
      if (busy) return queue.push(arguments);
      busy = true;
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

// assuming generated CVS is always like
// 1,what,everEOL
// with double quotes when necessary
// 2,"what's up",everEOL
// this parser works like a charm
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
    current,
    fields = Object.keys($fields),
    parsers = [],
    length = fields.length,
    i = 0; i < length; i++
  ) {
    current = $fields[fields[i]];
    parsers[i] = current === Boolean ?
      $Boolean :
      current
    ;
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
  return escape(paramsObject[key]);
}

function replaceQuestions() {
  return escape(paramsArray[paramsIndex++]);
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

function escape(what) {
  /*jshint eqnull: true*/
  var isNULL = what == null;
  switch (typeof what) {
    case 'object':
      what = isNULL ? 'null' : JSON.stringify(what);
      /* falls through */
    case 'string':
      return isNULL ? what : (
        "'" + what.replace(SINGLE_QUOTES, SINGLE_QUOTES_DOUBLED) + "'"
      );
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

function $Boolean(field) {
  switch(field.toLowerCase()) {
    case '':
    case '0':
    case 'false':
    case 'null':
      return false;
  }
  return true;
}

dblite.bin = 'sqlite3';

module.exports = dblite;

/**
var db =
  require('./src/dblite.js')('./test/dblite.test.sqlite').
  on('info', console.log.bind(console)).
  on('error', console.error.bind(console)).
  on('close', console.log.bind(console));

// CORE FUNCTIONS: http://www.sqlite.org/lang_corefunc.html

// PRAGMA: http://www.sqlite.org/pragma.html
db.query('PRAGMA table_info(kvp)');
*/