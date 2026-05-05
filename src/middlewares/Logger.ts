import winston from 'winston'
const {combine, timestamp, label, prettyPrint} = winston.format;

const logger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({format: 'YYYY-MM-DD  HH:mm:ss'}), //specify your desired timestamp format
        prettyPrint()
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({filename: 'logfile.log'}),
     

    ],
});

export default logger;