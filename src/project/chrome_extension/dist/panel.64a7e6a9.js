parcelRequire=function(e,r,t,n){var i,o="function"==typeof parcelRequire&&parcelRequire,u="function"==typeof require&&require;function f(t,n){if(!r[t]){if(!e[t]){var i="function"==typeof parcelRequire&&parcelRequire;if(!n&&i)return i(t,!0);if(o)return o(t,!0);if(u&&"string"==typeof t)return u(t);var c=new Error("Cannot find module '"+t+"'");throw c.code="MODULE_NOT_FOUND",c}p.resolve=function(r){return e[t][1][r]||r},p.cache={};var l=r[t]=new f.Module(t);e[t][0].call(l.exports,p,l,l.exports,this)}return r[t].exports;function p(e){return f(p.resolve(e))}}f.isParcelRequire=!0,f.Module=function(e){this.id=e,this.bundle=f,this.exports={}},f.modules=e,f.cache=r,f.parent=o,f.register=function(r,t){e[r]=[function(e,r){r.exports=t},{}]};for(var c=0;c<t.length;c++)try{f(t[c])}catch(e){i||(i=e)}if(t.length){var l=f(t[t.length-1]);"object"==typeof exports&&"undefined"!=typeof module?module.exports=l:"function"==typeof define&&define.amd?define(function(){return l}):n&&(this[n]=l)}if(parcelRequire=f,i)throw i;return f}({"AGiM":[function(require,module,exports) {
"use strict";function e(e,t){const o=t||e,n=document.getElementById(e);null!==n&&(n.onclick=(()=>{chrome.devtools.inspectedWindow.eval("console.log($0)"),chrome.devtools.inspectedWindow.eval(`_injected.getElement($0, '${o}')`,{useContentScriptContext:!0},(e,t)=>{console.log(e),console.info(t)})}))}function t(){const e=document.getElementById("goToOptions"),t=document.getElementById("userId"),o=document.getElementById("getUserId");e.onclick=(()=>{chrome.runtime.openOptionsPage()});const n=()=>{chrome.storage.sync.get("userId",e=>{void 0!==t.textContent&&(t.textContent=e.userId)})};o.onclick=n,window.onload=n,document.getElementById("toggleLayout").onclick=(()=>{const e=document.getElementById("segmentationContainer");e.classList.contains("horizontal-layout")?(e.classList.remove("horizontal-layout"),e.classList.add("vertical-layout")):(e.classList.remove("vertical-layout"),e.classList.add("horizontal-layout"))})}e("maincontent"),e("nav"),e("header"),e("footer"),e("title"),e("advertisement"),e("image"),e("0"),e("1"),e("2"),e("3"),e("4"),e("5"),e("6"),e("7"),t();
},{}]},{},["AGiM"], null)
//# sourceMappingURL=/panel.64a7e6a9.js.map