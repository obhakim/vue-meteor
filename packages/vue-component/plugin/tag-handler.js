import postcss from 'postcss';
//import autoprefixer from 'autoprefixer';

const jsImportsReg = /import\s+.+\s+from\s+.+;?\s*/g;
const jsExportDefaultReg = /export\s+default/g;
const quoteReg = /'/g;
const lineReg = /\r?\n|\r/g;
const tagReg = /<([\w\d-]+)(\s+.*?)?\/?>/ig;
const classAttrReg = /\s+class=(['"])(.*?)\1/gi;

// Tag handler
VueComponentTagHandler = class VueComponentTagHandler {
  constructor(inputFile, babelOptions) {
    this.inputFile = inputFile;
    this.babelOptions = babelOptions;

    this.component = {
      template: null,
      script: null,
      styles: []
    };
  }

  addTagToResults(tag) {
    this.tag = tag;

    try {
      if (this.tag.tagName === "template") {
        if (this.component.template) {
          this.throwCompileError("Only one <template> allowed in component file", this.tag.tagStartIndex)
        }

        this.component.template = this.tag;

      } else if (this.tag.tagName === "script") {
        if (this.component.script) {
          this.throwCompileError("Only one <script> allowed in component file", this.tag.tagStartIndex)
        }

        this.component.script = this.tag;

      } else if (this.tag.tagName === "style") {

        this.component.styles.push(this.tag);

      } else {
        this.throwCompileError("Expected <template>, <script>, or <style> tag in template file", this.tag.tagStartIndex);
      }
    } catch (e) {
      if (e.scanner) {
        // The error came from Spacebars
        this.throwCompileError(e.message, this.tag.contentsStartIndex + e.offset);
      } else {
        throw e;
      }
    }
  }

  getResults() {

    let map = '';
    let source = this.inputFile.getContentsAsString();
    let packageName = this.inputFile.getPackageName();
    let inputFilePath = this.inputFile.getPathInPackage();
    let hash = '__v' + this.inputFile.getSourceHash();

    let js = 'exports.__esModule = true;var __vue_script__, __vue_template__;';
    let styles = [];

    // Script

    if (this.component.script) {
      let tag = this.component.script;
      let script = tag.contents;

      // Export
      script = script.replace(jsExportDefaultReg, 'return');

      // Babel options
      this.babelOptions.sourceMap = true;
      this.babelOptions.filename =
        this.babelOptions.sourceFileName = packageName ? "/packages/" + packageName + "/" + inputFilePath : "/" + inputFilePath;
      this.babelOptions.sourceMapTarget = this.babelOptions.filename + ".map";

      // Babel
      let output = Babel.compile(script, this.babelOptions);

      js += '__vue_script__ = (function(){' + output.code + '\n})();';
      //js += imports;
      map = output.map;
    }

    // Template
    if (this.component.template) {
      let template = this.component.template.contents;

      // Tag hash (for scoping)
      let result;
      template = template.replace(tagReg, (match, p1, p2, offset) => {
        let attributes = p2;
        if(!attributes) {
          return match.replace(p1, p1 + ` ${hash}`);
        } else {
          attributes += ` ${hash}`;
          return match.replace(p2, attributes);
        }
      });

      template = template.replace(quoteReg, "\\'").replace(lineReg, '');
      js += "__vue_template__ = '" + template + "';";

    }

    // Styles
    for (let styleTag of this.component.styles) {
      let css = styleTag.contents;
      let cssMap = null;

      // Lang
      if (styleTag.attribs.lang !== null) {
        // TODO
      }

      // Postcss
      let plugins = [];
      let postcssOptions = {
        form: inputFilePath,
        to: inputFilePath,
        map: {
          inline: false,
          annotation: false,
          prev: cssMap
        }
      }

      // Scoped
      if (styleTag.attribs.scoped) {
        plugins.push(addHash({
          hash
        }));
      }

      // Autoprefixer
      if (styleTag.attribs.autoprefix !== 'off') {
          // Removed - Performance issue while loading the plugin
        //plugins.push(autoprefixer());
      }

      // Postcss result
      let result = postcss(plugins).process(css, postcssOptions);
      css = result.css;
      cssMap = result.map;

      styles.push({
        css,
        map: cssMap
      })
    }

    // Output
    js += `__vue_script__ = __vue_script__ || {};
    if(__vue_template__) {
      (typeof __vue_script__ === "function" ?
      (__vue_script__.options || (__vue_script__.options = {}))
      : __vue_script__).template = __vue_template__;
    }
    exports.default = __vue_script__;`;

    return {
      code: js,
      map,
      styles
    };
  }

  throwCompileError(message, overrideIndex) {
    throwCompileError(this.tag, message, overrideIndex);
  }
}
