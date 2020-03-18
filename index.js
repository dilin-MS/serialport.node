const path = require("path");
const fs = require("fs-extra");

// copy platform compatible node binary to library
function loadLibrary(libraryName, destPath) {
    const parentFolder = path.join(__dirname, "native");
    const electron = "7.1.11";
    const pattern = RegExp(`${libraryName}*_${electron}_${process.arch}.node`);
    const preBuildNodeFile = fs.readdirSync(parentFolder).filter((file) => {
        return file.match(pattern);
    })

    if (!preBuildNodeFile) {
        console.log('[Warn]', `no available ${libraryName} with electron ${electron}, arch ${process.arch}`);
    }

    // copy library node
    const srcPath = path.join(parentFolder, preBuildNodeFile);
    fs.copyFileSync(srcPath, destPath);
    console.log('using', preBuildNodeFile);
}

const detectionNodeDestPath = path.join(__dirname, `../usb-detection/build/Release/detection.node`);
loadLibrary('detector', detectionNodeDestPath);

const serialportNodeDestPath = path.join(__dirname, `../@serialport/bindings/build/Release/bindings.node`);
loadLibrary('serialport', serialportNodeDestPath);

exports.detector = require("usb-detection");
exports.SerialPort = require("serialport");