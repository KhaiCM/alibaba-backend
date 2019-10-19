const moduleAlias = require('module-alias/register')
const path = require('path')
const cli = require('commander')
const data = require(path.join(__dirname, 'data.json'))
const db = require('@db')

cli
  .version('1.0.0')
  .description('Management Command Line Interface')
  .option(
    '--env [name]',
    'environment, default: process.env.NODE_ENV || development'
  )
  .parse(process.argv)

cli
  .command('migrate')
  .description('Migration and seed database')
  .action(async () => {
    const opts = cli.opts()
    try {
      // await db.users.truncate()
      // await db.users.insert(data.users)
      let users = await db.users.all()
      await db.users.updateBatchUserId(users)
    } catch(err) {
      throw err
    }
    process.exit(0)
  })

cli.parse(process.argv)
if (!cli.args.length) cli.help()
