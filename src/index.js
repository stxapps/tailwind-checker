import fs from 'fs';
import path from 'path';
import requireFresh from 'import-fresh'
import postcss from 'postcss'

// @ts-ignore
import setupContextUtils from 'tailwindcss/lib/lib/setupContextUtils'
import resolveConfig from 'tailwindcss/resolveConfig'

const baseDir = '/home/linux/Drive/Workspace';
const repos = [
  {
    twConfigFPath: `${baseDir}/brace-client/packages/web/tailwind.config.js`,
    twCssFPath: `${baseDir}/brace-client/packages/web/src/stylesheets/tailwind.css`,
    componentsDir: `${baseDir}/brace-client/packages/web/src/components`,
  },
  {
    //twConfigFPath: `${baseDir}/brace-client/packages/mobile/tailwind.config.js`,
    twConfigFPath: `${baseDir}/brace-client/packages/web/tailwind.config.js`,
    twCssFPath: `${baseDir}/brace-client/packages/mobile/tailwind.css`,
    componentsDir: `${baseDir}/brace-client/packages/mobile/src/components`,
  },
  {
    twConfigFPath: `${baseDir}/justnote-client/packages/web/tailwind.config.js`,
    twCssFPath: `${baseDir}/justnote-client/packages/web/src/stylesheets/tailwind.css`,
    componentsDir: `${baseDir}/justnote-client/packages/web/src/components`,
  },
  {
    //twConfigFPath: `${baseDir}/justnote-client/packages/mobile/tailwind.config.js`,
    twConfigFPath: `${baseDir}/justnote-client/packages/web/tailwind.config.js`,
    twCssFPath: `${baseDir}/justnote-client/packages/mobile/tailwind.css`,
    componentsDir: `${baseDir}/justnote-client/packages/mobile/src/components`,
  },
];

const IGNORE_UNKNOWN_CLASS_NAMES = [
  'lds-ellipsis', 'lds-rotate', 'square-spin',
  'ball-clip-rotate', 'blk:ball-clip-rotate-blk',
  'aspect-7/12', 'shadow-xs', 'elevation-xl', 'group-s', 'pattern',
  'preview-mode',
];

const bigSign = (value) => {
  return Number(value > 0n) - Number(value < 0n);
};

const getTwContext = (twConfigFPath, twCssFPath) => {
  const twConfig = resolveConfig(requireFresh(twConfigFPath));
  const twCss = postcss.parse(fs.readFileSync(twCssFPath, 'utf-8'));

  const twContext = setupContextUtils.createContext(twConfig, [], twCss);
  return twContext;
};

const _sortClasses = (logs, twContext, classes) => {
  const orders = twContext.getClassOrder(classes);

  const knownOrders = [];
  const unknownClasses = [];
  for (const order of orders) {
    if (!order[1]) {
      unknownClasses.push(order[0]);
      if (order[0].length > 0 && !IGNORE_UNKNOWN_CLASS_NAMES.includes(order[0])) {
        logs.push(`Unknown class: ${order[0]}`,);
      }
    } else knownOrders.push(order);
  }

  knownOrders.sort(([, a], [, z]) => {
    if (a === z) return 0
    if (a === null) return -1
    if (z === null) return 1
    return bigSign(a - z)
  });

  const sortedClasses = knownOrders.map(order => order[0]);

  return { sortedClasses, unknownClasses };
};

const sortClasses = (logs, twContext, classStr) => {
  const literals = [];

  const lRegex = /\$\{([^}]+)\}/g;
  for (const match of classStr.matchAll(lRegex)) {
    const literal = match[0];
    literals.push(literal);
  }
  for (const literal of literals) classStr = classStr.split(literal).join('');

  const classes = classStr.trim().split(/\s+/);

  const result = _sortClasses(logs, twContext, classes);

  let sortedClassStr = `${result.sortedClasses.join(' ')}`;
  sortedClassStr += ` ${result.unknownClasses.join(' ')}`;
  sortedClassStr += ` ${literals.join(' ')}`;
  sortedClassStr = sortedClassStr.replace(/\s\s+/g, ' ').trim();

  return sortedClassStr;
};

const processFile = async (twContext, fpath, fname, overwrite) => {

  const vRegex = /lassName[s]{0,1} = '([^']+)'/g;
  const tsRegex = /tailwind\('([^']+)'/g;
  const tbRegex = /tailwind\(`([^`]+)`/g;
  const regexes = [vRegex, tsRegex, tbRegex];

  const outs = [], logs = [];
  const lines = fs.readFileSync(fpath, 'utf-8').trim().split('\n');
  for (const line of lines) {
    let out = line;
    for (const regex of regexes) {
      for (const match of line.matchAll(regex)) {
        const classStr = match[1];

        const sortedClassStr = sortClasses(logs, twContext, classStr);
        if (classStr !== sortedClassStr) {
          logs.push(`A: ${classStr}`);
          logs.push(`B: ${sortedClassStr}`);
          logs.push('');

          out = out.split(classStr).join(sortedClassStr);
        }
      }
    }
    outs.push(out);
  }

  if (overwrite) {
    fs.writeFileSync(fpath, outs.join('\n') + '\n');
  }

  if (logs.length > 0) {
    console.log('------------------------------------------------------------');
    console.log(`${fname}`);
    console.log('------------------------------------------------------------');
    for (const log of logs) console.log(log);
    console.log('');
  }
};

const traverse = async (twContext, componentsDir) => {
  let lstat = fs.lstatSync(componentsDir)
  if (!lstat.isDirectory()) {
    console.log(`${componentsDir} is not a directory!`);
    return;
  }

  const fnames = fs.readdirSync(componentsDir);
  for (const fname of fnames) {
    const fpath = path.join(componentsDir, fname);
    lstat = fs.lstatSync(fpath);
    if (!lstat.isFile()) {
      console.log(`${fpath} is not a file!`);
      continue;
    }

    await processFile(twContext, fpath, fname, false);
  }
};

const main = async () => {
  for (const repo of repos.slice(0, 4)) {
    const twContext = getTwContext(repo.twConfigFPath, repo.twCssFPath);
    await traverse(twContext, repo.componentsDir);
  }

  console.log('Finished.');
};

main();
