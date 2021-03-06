const path = require("path");

// Get the .node file path according to if the module being bundled by webapck.
// either 'usb-detection' nor 'serialport' is webpack friendly, we need to search 'node_modules' folder 
// if your project using webpack to bundle .js files, if not search the same parent folder.
function getPath(relativePath) {
    const destPath = typeof __webpack_require__ === "function" ? "../node_modules/" + relativePath : "../../" + relativePath;
    return path.join(__dirname, destPath);
}

exports.getPath = getPath;