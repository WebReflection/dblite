//remove:
var dblite = require('../build/dblite.node.js'),
    file = require('path').join(
      require('os').tmpdir(), 'dblite.test.sqlite'
    ),
    db;
//:remove

wru.test([
  {
    name: "main",
    test: function () {
      wru.assert(typeof dblite == "function");
      db = dblite(file);
    }
  },{
    name: 'create table if not exists',
    test: function () {
      db.query('CREATE TABLE IF NOT EXISTS `kvp` (id INTEGER PRIMARY KEY, key TEXT, value TEXT)');
      db.on('info', wru.async(function (data) {
        db.removeListener('table exists', arguments.callee);
        wru.assert('table exists', /^kvp\b/.test('' + data));
      }));
      db.query('.tables');
    }
  },{
    name: '100 sequential inserts',
    test: function () {
      var start = Date.now(), many = 0;
      db.on('error', wru.log);
      while(many++ < 100) {
        db.query('INSERT INTO kvp VALUES(null, "k' + many + '", "v' + many + '")');
      }
      db.lastRowID('kvp', wru.async(function(data){
        wru.log(data + ' records in ' + ((Date.now() - start) / 1000) + ' seconds');
        wru.assert(100 == data);
      }));
    }
  },{
    name: '1 transaction with 100 inserts',
    test: function () {
      var start = Date.now(), many = 0;
      db.on('error', wru.log);
      db.query('BEGIN TRANSACTION');
      while(many++ < 100) {
        db.query('INSERT INTO kvp VALUES(null, "k' + many + '", "v' + many + '")');
      }
      db.query('COMMIT');
      db.lastRowID('kvp', wru.async(function(data){
        wru.log(data + ' records in ' + ((Date.now() - start) / 1000) + ' seconds');
        wru.assert(200 == data);
      }));
    }
  },{
    name: 'auto escape',
    test: function () {
      var uniqueKey = 'key' + Math.random();
      db.query('INSERT INTO kvp VALUES(?, ?, ?)', [null, uniqueKey, 'unique value']);
      db.query('SELECT * FROM kvp WHERE key = ?', [uniqueKey], wru.async(function (rows) {
        wru.assert('all good', rows.length === 1 && rows[0][2] === 'unique value' && rows[0][1] === uniqueKey);
      }));
    }
  },{
    name: 'auto field',
    test: function () {
      var start = Date.now();
      db.query('SELECT * FROM kvp', ['id', 'key', 'value'], wru.async(function (rows) {
        start = Date.now() - start;
        wru.log('fetched ' + rows.length + ' rows as objects in ' + (start / 1000) + ' seconds');
        wru.assert(
          'all good',
          rows[0].hasOwnProperty('id') &&
          rows[0].hasOwnProperty('key') &&
          rows[0].hasOwnProperty('value') &&
          rows[rows.length - 1].hasOwnProperty('id') &&
          rows[rows.length - 1].hasOwnProperty('key') &&
          rows[rows.length - 1].hasOwnProperty('value')
        );
      }));
    }
  },{
    name: 'auto parsing field',
    test: function () {
      var start = Date.now();
      db.query('SELECT * FROM kvp', {
        num: parseInt,
        whatsoever: String,
        whatever: String
      }, wru.async(function (rows) {
        start = Date.now() - start;
        wru.log('fetched ' + rows.length + ' rows as normalized objects in ' + (start / 1000) + ' seconds');
        wru.assert(
          'all good',
          rows[0].hasOwnProperty('num') && typeof rows[0].num === 'number' &&
          rows[0].hasOwnProperty('whatsoever') &&
          rows[0].hasOwnProperty('whatever') &&
          rows[rows.length - 1].hasOwnProperty('num') && typeof rows[rows.length - 1].num === 'number' &&
          rows[rows.length - 1].hasOwnProperty('whatsoever') &&
          rows[rows.length - 1].hasOwnProperty('whatever')
        );
      }));
    }
  },{
    name: 'erease file',
    test: function () {
      db.on('close', wru.async(function () {
        require('fs').unlinkSync(file);
        wru.assert('bye bye');
      })).close();
    }
  }
]);
