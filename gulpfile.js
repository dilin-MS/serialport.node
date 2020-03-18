require('shelljs/global');
const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const async = require('async');
const cliArgs = require('yargs').argv;
const linuxDistro = require('linux-distro');
const github = require('octonode');
const git = require('simple-git')();

function getRepoName(gitUrl) {
    const fields = gitUrl.split(':');
    if (fields.length < 2) return '';
    const segments = fields[1].split('/');
    const userName = segments[segments.length-2];
    const repoName = segments[segments.length-1];
    const fullRepoName = `${userName}/${repoName}`;
    const position = fullRepoName.length - '.git'.length;
    const lastIndex = fullRepoName.lastIndexOf('.git');
    if (lastIndex !== -1 && lastIndex === position) {
        return fullRepoName.substring(0, position);
    } else {
        return fullRepoName;
    }
}

function uploadAssets(client, tagName, filePath, libraryName, arch, callback) {
    async.waterfall([
        // get assets name
        (callback) => {
            distName = getPackageName(libraryName, arch);
            if (!distName) {
                callback('Fail to get package name');
            }
            console.log(`package name: ${distName}`);
            callback(null, distName);
        },
        // parse repo name from git repository configuration
        (distName, callback) => {
            git.listRemote(['--get-url'], function(err, data) {
                if (!err) {
                    console.log('Remote url for repository at ' + __dirname + ':');
                    const repoName = getRepoName(data.trim());
                    console.log(repoName);
                    if (repoName) {
                        callback(null, distName, repoName);
                    } else {
                        callback('Cannot get repo name for this repository.');
                    }
                } else {
                    callback(err);
                }
            });
        },
        // get release by tag
        (distName, repoName, callback) => {
            client.get(`/repos/${repoName}/releases/tags/${tagName}`, (err, res, body) => {
                if (!err) {
                    console.log(`release id: ${body.id}`);
                    callback(null, distName, poName, body.id);
                } else {
                    console.log(`[debug] getting: /repos/${repoName}/releases/tags/${tagName}`);
                    console.log(`err: ${err}`);
                    callback(`The release via tag ${tagName} not found!`);
                }
            });
        },
        // check if asset exist or not.
        (distName, repoName, releaseId, callback) => {
            client.get(`/repos/${repoName}/releases/${releaseId}/assets`, (err, res, body) => {
                if (!err) {
                    const find = body.find((element) => {
                        return element.name === distName;
                    });
                    if (find) {
                        console.log(`Finded an existing asset '${distName} in github release and delete it first.`);
                        client.del(`/repos/${repoName}/releases/assets/${find.id}`, null, (err1, res1, body1) => {
                            if (err1) {
                                callback(`Cannot delete assets '${distName}'. See the error '${err1}'`);
                            } else {
                                callback(null, repoName, releaseId);
                            }
                        });
                    } else {
                        callback(null, distName, repoName, releaseId);
                    }
                } else {
                    callback(null, distName, repoName, releaseId, null);
                }
            });
        },
        // upload assets to releases.
        (distName, repoName, releaseId, callback) => {
            const ghRelease = client.release(repoName, releaseId);
            const archive = fs.readFileSync(filePath);
            ghRelease.uploadAssets(archive, {
                name: distName,
                contentType: 'application/octet-stream',
                uploadHost: 'uploads.github.com',
            }, (err, res, body) => {
                if (!err) {
                    console.log(`Succeeded to upload assets '${distName}' to github release '${tagName}'`);
                }
                callback(err);
            });
        }
    ], (error, results) => {
        callback(error);
    });
}

function getPackageName(nodeName, arch) {
    let packageName;
    const platform = require('os').platform();
    if (platform == "linux") {
        linuxDistro().then(data => {
            packageName = `${nodeName}_${data.os}${data.release || data.code}_${electron}_${arch}.node`;
        }, () => {
            packageName = `${nodeName}_${platform}_${electron}_${arch}.node`;
        });
    } else {
        packageName = `${nodeName}_${platform}_${electron}_${arch}.node`;
    }

    console.log(`packageName: ${packageName}`);
    return packageName;
}

gulp.task('build', (done)=> {
    if (!cliArgs.token || !cliArgs.tag) {
        done('Missing token, tag parameters!');
        return ;
    }
    const client = github.client(cliArgs.token);
    const tagName = cliArgs.tag;

    const archs = ["ia32", "x64"];
    const electron = "7.1.11";
    const platform = require('os').platform();

    const tasks = [];
    async.waterfall([
        (callback) => {
        archs.forEach((arch) => {
            // Skip [arch=ia32, platform=linux]
            if (platform == "linux" && arch == "ia32")
                return callback(null, "Skip [arch=ia32, platform=linux]");

            const rebuildCommand = `node-gyp rebuild --target=${electron} --arch=${arch} --dist-url=https://atom.io/download/electron`;

            tasks.push((callback) => {
                const detectionPath = "./node_modules/usb-detection";
                const detectionNodePath = path.normalize(path.join(__dirname, detectionPath, 'build/Release/detection.node'));
                // const detectionPackageName = getPackageName("detector", platform, arch);
                const libraryName = "detector";
                console.log(`[node-gyp] Starting to build usb-detection binary version for electron ${electron} and arch ${arch}.`);
                const compile = exec(`${rebuildCommand}`, {cwd: path.join(__dirname, path.normalize(detectionPath))});
                if (compile.code) {
                    callback('[node-gyp] Compiling usb-detection native code failed.');
                } else {
                    console.log('[node-gyp] Build complete.');
                    console.log(`Generate dll at ${detectionNodePath}`);
                    uploadAssets(client, tagName, detectionNodePath, libraryName, arch, callback);
                }
            });

            tasks.push((callback) => {
                const serialportPath = "./node_modules/@serialport/bindings";
                const serialportNodePath = path.normalize(path.join(serialportPath, 'build/Release/bindings.node'));
                // const serialportPackageName = getPackageName("serialport", platform, arch);
                const libraryName = "serialport";
                console.log(`[node-gyp] Starting to build serialport binary version for electron ${electron} and arch ${arch}.`);
                const compile = exec(`${rebuildCommand}`, {cwd: path.normalize(serialportPath)});
                if (compile.code) {
                    callback('[node-gyp] Compiling serialport native code failed.');
                } else {
                    console.log('[node-gyp] Build complete.');
                    console.log(`Generate dll at ${serialportNodePath}`);
                    uploadAssets(client, tagName, serialportNodePath, libraryName, arch, callback);
                }
            });
        });
        async.series(tasks, callback);
        },
    ], (error, result) => {
        done(error);
    });
});
