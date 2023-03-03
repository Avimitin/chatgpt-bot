import chalk from "npm:chalk@5.2.0";

function info(msg: string) {
  console.log(chalk.bold.greenBright("==> ") + chalk.bold(msg));
}

function subInfo(msg: string) {
  console.log(chalk.bold.blueBright("   -> ") + chalk.bold(msg));
}

function warning(msg: string) {
  console.log(chalk.bold.yellowBright("=> WARNING: ") + msg);
}

function error(msg: string) {
  console.log(chalk.bold.red("=> ERROR: ") + msg);
}

export {
  info, subInfo, warning, error
};
