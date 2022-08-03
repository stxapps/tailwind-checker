import fs from 'fs';
import path from 'path';

// @ts-ignore
import setupContextUtils from 'tailwindcss/lib/lib/setupContextUtils'
import resolveConfig from 'tailwindcss/resolveConfig'

const baseDir = '/home/linux/Drive/Workspace';
const repos = [
  {
    twFPath: `${baseDir}/brace-client/packages/web/tailwind.config.js`,
    componentsDir: `${baseDir}/brace-client/packages/web/src/components`,
  },
  /*{},
  {},
  {},*/
];

const bigSign = (value) => {
  return Number(value > 0n) - Number(value < 0n);
};

const getTwContext = async (twConfigFPath) => {
  const twConfig = await import(twConfigFPath);
  const twContext = setupContextUtils.createContext(resolveConfig(twConfig));
  return twContext;
};

const _sortClasses = (twContext, classes) => {
  const orders = twContext.getClassOrder(classes);

  const knownOrders = [];
  const unknownClasses = [];
  for (const order of orders) {
    if (!order[1]) unknownClasses.push(order[0]);
    else knownOrders.push(order);
  }

  knownOrders.sort((a, b) => {
    const x = a[1]
    const y = b[1]

    if (x === y) return 0
    if (x === null) return -1
    if (y === null) return 1
    return bigSign(x - y)
  });

  const sortedClasses = knownOrders.map(order => order[0]);

  return { sortedClasses, unknownClasses };
};

const sortClasses = (twContext, classStr) => {
  const literals = [];

  const lRegex = /\$\{([^}]+)\}/g;
  for (const match of classStr.matchAll(lRegex)) {
    const literal = match[1];
    literals.push(literal);
  }
  for (const literal of literals) classStr.split(literal).join('');

  const classes = classStr.split(/\s+/);

  const commonClasses = [];
  const darkClasses = [];
  for (const className of classes) {
    if (className.startsWith('dark:')) darkClasses.push(className);
    else commonClasses.push(className);
  }

  const commonResult = _sortClasses(twContext, commonClasses);
  const darkResult = _sortClasses(twContext, darkClasses);

  let sortedClassStr = `${commonResult.sortedClasses.join(' ')}`;
  sortedClassStr += ` ${commonResult.unknownClasses.join(' ')}`;
  sortedClassStr += ` ${darkResult.sortedClasses.join(' ')}`;
  sortedClassStr += ` ${darkResult.unknownClasses.join(' ')}`;
  sortedClassStr += ` ${literals.join(' ')}`;
  sortedClassStr = sortedClassStr.replace(/\s\s+/g, ' ').trim();

  return sortedClassStr;
};

const processFile = async (twContext, fpath, fname, overwrite) => {
  const dRegex = /\s+className="([^"]+)"/g;
  const sRegex = /\s+className='([^']+)'/g;
  const bbRegex = /\s+className={`([^`]+)`}/g;
  const bsRegex = /\s+className={'([^']+)'}/g;
  const vRegex = /lassName[s]{0, 1} = '([^']+)'/g;
  //const regex4 = /tailwind\('([^'])'\)/g;
  const regexes = [dRegex, sRegex, bbRegex, bsRegex, vRegex];

  console.log('------------------------------------------------------------');
  console.log(`${fname}`);
  console.log('------------------------------------------------------------');

  const outs = [];
  const lines = fs.readFileSync(fpath, 'utf-8').trim().split('\n');
  for (let line of lines) {
    for (const regex of regexes) {
      for (const match of line.matchAll(regex)) {
        const classStr = match[1];
        const sortedClassStr = sortClasses(twContext, classStr);

        if (classStr !== sortedClassStr) {
          console.log(`A: ${classStr}`);
          console.log(`B: ${sortedClassStr}`);
          console.log('');
          line.split(classStr).join(sortedClassStr);
        }
      }
    }

    outs.push(line);
  }

  if (overwrite) {
    fs.writeFileSync(fpath, outs.join('\n'));
  }
  console.log('');
};

const traverse = async (twConfigFPath, componentsDir) => {
  const twContext = await getTwContext(twConfigFPath);

  let lstat = fs.lstatSync(componentsDir)
  if (!lstat.isDirectory()) {
    console.log(`${componentsDir} is not a directory!`);
    return;
  }

  const children = fs.readdirSync(componentsDir);
  for (const child of children) {
    const fpath = path.join(componentsDir, child);
    lstat = fs.lstatSync(fpath);
    if (!lstat.isFile()) {
      console.log(`${fpath} is not a file!`);
      continue;
    }

    await processFile(twContext, fpath, child, false);


    break;
  }
};

const main = async () => {

  for (const repo of repos) await traverse(repo.twFPath, repo.componentsDir);
  console.log('Finished.');
};


main();