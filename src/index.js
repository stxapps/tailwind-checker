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
    twCssFPath: `${baseDir}/brace-client/packages/web/tailwind.css`,
    componentsDir: `${baseDir}/brace-client/packages/web/src/components`,
  },
  {
    twConfigFPath: `${baseDir}/brace-client/packages/mobile/tailwind.config.js`,
    twCssFPath: `${baseDir}/brace-client/packages/mobile/tailwind.css`,
    componentsDir: `${baseDir}/brace-client/packages/mobile/src/components`,
  },
  {
    twConfigFPath: `${baseDir}/justnote-client/packages/web/tailwind.config.js`,
    twCssFPath: `${baseDir}/justnote-client/packages/web/src/stylesheets/tailwind.css`,
    componentsDir: `${baseDir}/justnote-client/packages/web/src/components`,
  },
  {
    twConfigFPath: `${baseDir}/justnote-client/packages/mobile/tailwind.config.js`,
    twCssFPath: `${baseDir}/justnote-client/packages/mobile/tailwind.css`,
    componentsDir: `${baseDir}/justnote-client/packages/mobile/src/components`,
  },
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

const _sortClasses = (twContext, classes) => {
  const orders = twContext.getClassOrder(classes);

  const knownOrders = [];
  const unknownClasses = [];
  for (const order of orders) {
    if (!order[1]) {
      unknownClasses.push(order[0]);
      console.log('Unknown class: ', order[0]);
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

const sortClasses = (twContext, classStr) => {
  const literals = [];

  const lRegex = /\$\{([^}]+)\}/g;
  for (const match of classStr.matchAll(lRegex)) {
    const literal = match[0];
    literals.push(literal);
  }
  for (const literal of literals) classStr = classStr.split(literal).join('');

  const classes = classStr.trim().split(/\s+/);

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

const processFile = async (twContext, fpath, fname, overwrite, doInsertTailwind) => {
  const dRegex = /\s+className=("[^"]+")/g;
  const sRegex = /\s+className=('[^']+')/g;
  const bbRegex = /\s+className={(`[^`]+`)}/g;
  const bsRegex = /\s+className={('[^']+')}/g;
  const vRegex = /lassName[s]{0,1} = '([^']+)'/g;
  const tsRegex = /tailwind\('([^']+)'/g;
  const tbRegex = /tailwind\(`([^`]+)`/g;
  const regexes = [dRegex, sRegex, bbRegex, bsRegex, vRegex, tsRegex, tbRegex];

  console.log('------------------------------------------------------------');
  console.log(`${fname}`);
  console.log('------------------------------------------------------------');

  const outs = [];
  const lines = fs.readFileSync(fpath, 'utf-8').trim().split('\n');
  for (const line of lines) {
    let out = line;
    for (const regex of regexes) {
      for (const match of line.matchAll(regex)) {
        const classStr = match[1];

        if (doInsertTailwind) {
          const stripClassStr = classStr.slice(1, -1);
          const sortedClassStr = sortClasses(twContext, stripClassStr);

          console.log(`A: ${classStr}`);
          console.log(`B: ${sortedClassStr}`);
          console.log('');

          let twSortedClassStr;
          if (sortedClassStr.includes('$')) {
            twSortedClassStr = `{tailwind(\`${sortedClassStr}\`)}`;
          } else {
            twSortedClassStr = `{tailwind('${sortedClassStr}')}`;
          }
          out = out.split(classStr).join(twSortedClassStr);
        } else {
          const sortedClassStr = sortClasses(twContext, classStr);
          if (classStr !== sortedClassStr) {
            console.log(`A: ${classStr}`);
            console.log(`B: ${sortedClassStr}`);
            console.log('');

            out = out.split(classStr).join(sortedClassStr);
          }
        }
      }
    }
    outs.push(out);
  }

  if (overwrite) {
    fs.writeFileSync(fpath, outs.join('\n'));
  }
  console.log('');
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

    await processFile(twContext, fpath, fname, false, false);
  }
};

const main = async () => {
  /*for (const repo of repos) {
    const twContext = getTwContext(repo.twConfigFPath, repo.twCssFPath);
    await traverse(twContext, repo.componentsDir);
  }*/

  const repoIndex = 3;
  const repo = repos[repoIndex];
  const twContext = getTwContext(repo.twConfigFPath, repo.twCssFPath);
  const fname = 'NoteEditor.js';
  const fpath = path.join(repo.componentsDir, fname);
  const overwrite = true;
  const doInsertTailwind = [0, 2].includes(repoIndex) ? true : false;
  //const overwrite = false;
  //const doInsertTailwind = false;
  await processFile(twContext, fpath, fname, overwrite, doInsertTailwind);

  console.log('Finished.');
};

main();
