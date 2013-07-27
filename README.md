a zero hassle wrapper for sqlite


### The What And The Why
I've created `dblite` module because there's still not a simple and straight forward or standard way to have [sqlite](http://www.sqlite.org) in [node.js](http://nodejs.org) without requiring to re-compile, re-build, download sources a part or install dependencies instead of simply `apt-get install sqlite3` or `pacman -S sqlite` in your \*nix system.

`dblite` has been created with portability, simplicity, and reasonable performance for **embedded Hardware** such [Raspberry Pi](http://www.raspberrypi.org) and [Cubieboard](http://cubieboard.org), or generally speaking all linux based distributions like [Arch Linux](https://www.archlinux.org) where is not always that easy to `node-gyp` a module and add dependencies that work.

You have `node`, You have `sqlite`, that's all you need to `require('dblite')` and start managing your SQLite database file.


### API
Right now a created `db` has 3 methods: `.query()`, `.lastRowID()`, and `.close()`.

The `.lastRowID(table, callback(rowid))` helper simplifies a common operation with SQL tables after inserts, handful as shortcut for the following query:
`SELECT ROWID FROM `table` ORDER BY ROWID DESC LIMIT 1`.

The method `.close()` does exactly what it suggests: it closes the database connection.
Please note that it is **not possible to perform other operations once it has been closed**.

Being an `EventEmitter` instance, the database variable will be notified with the `close` listener, if any.


### Understanding The .query() Method
The main role in this module is played by the `dblite.query()` method, a method rich in overloads all with perfect and natural meaning.

The amount of parameters goes from one to four, left to right, where left is the input going through the right which is the eventual output.

All parameters are optionals except the SQL one, where if non specified, `console.log(arguments)` will be used as implicit callback if none has been specified as last parameters used when `.query()` was invoked.


### dblite.query() Possible Combinations
```javascript
dblite.query(SQL)
dblite.query(SQL, callback:Function)
dblite.query(SQL, params:Array|Object)
dblite.query(SQL, fields:Array|Object)
dblite.query(SQL, params:Array|Object, callback:Function)
dblite.query(SQL, fields:Array|Object, callback:Function)
dblite.query(SQL, params:Array|Object, fields:Array|Object)
dblite.query(SQL, params:Array|Object, fields:Array|Object, callback:Function)
```
All above combinations are [tested properly in this file](test/dblite.js) together with many other tests able to make `dblite` robust enough and ready to be used.

Please note how `params` is always before `fields` and/or `callback` if `fields` is missing, just as reminder that order is left to right accordingly with what are trying to do.

Following detailed explanation per each parameter.

#### The SQL:string
This string [accepts any query understood by SQLite](http://www.sqlite.org/lang.html) plus it accepts all commands that regular SQLite shell would accept such `.databases`, `.tables`, `.show` and all others passing through the specified `info` listener, if any.
```javascript
var dblite = require('dblite'),
    db = dblite('./db.sqlite');

db.on('info', function (data) {
  // generic info, not a SELECT result
  // neither a PRAGMA one - just commands
  console.log(String(data));
});

db.query('.show');
/* will console.log something like:

     echo: off
  explain: off
  headers: off
     mode: csv
nullvalue: ""
   output: stdout
separator: ","
    stats: off
    width:
*/

// normal query
db.query('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)');
db.query('INSERT INTO test VALUES(null, ?)', ['some text']);
db.query('SELECT * FROM test');
// will implicitly log the following
// [ [ '1', 'some text' ] ]
```

#### The params:Array|Object
If the SQL string is **not a command** and **contains special chars** such `?`, `:key`, `$key`, or `@key` properties, these will be replaced accordingly with the `params` `Array` or `Object` that, in this case, MUST be present.
```javascript
// params as Array
db.query('SELECT * FROM test WHERE id = ?', [1]);

// params as Object
db.query('SELECT * FROM test WHERE id = :id', {id:1});
// same as
db.query('SELECT * FROM test WHERE id = $id', {id:1});
// same as
db.query('SELECT * FROM test WHERE id = @id', {id:1});
```

#### The fields:Array|Object
By default, results are returned as an `Array` where all rows are the outer `Array` and each single row is another `Array`.
```javascript
db.query('SELECT * FROM test');
// will log something like:
[
  [ '1', 'some text' ],     // row1
  [ '2', 'something else' ] // rowN
]
```
If we specify a fields parameter we can have each row represented by an object, instead of an array.
```javascript
// same query using fields as Array
db.query('SELECT * FROM test', ['key', 'value']);
// will log something like:
[
  {key: '1', value: 'some text'},     // row1
  {key: '2', value: 'something else'} // rowN
]
```

#### Parsing Through The fields:Object
[SQLite Datatypes](http://www.sqlite.org/datatype3.html) are different from JavaScript plus SQLite works via affinity.
This module also parses sqlite3 output which is **always a string** and as string every result will always be returned **unless** we specify `fields` parameter as object, suggesting validation per each field.
```javascript
// same query using fields as Object
db.query('SELECT * FROM test', {
  key: Number,
  value: String
});
// note the key as integer!
[
  {key: 1, value: 'some text'},     // row1
  {key: 2, value: 'something else'} // rowN
]
```
More complex functions can be passed without problems:
```javascript
// same query using fields as Object
db.query('SELECT * FROM users', {
  id: Number,
  name: String,
  adult: Boolean,
  skills: JSON.parse,
  birthday: Date,
  cube: function (fieldValue) {
    return fieldValue * 3;
  }
});
```