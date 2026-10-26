/* =========================================================
   Gradient Wave — latar animasi untuk bagian hero
   Versi JavaScript biasa (tanpa React) dari komponen 21st.dev "gradient-wave"
   Pemakaian: <div data-gradient-wave data-colors="#ccfbf1,#ffffff,#5eead4,#f0fdfa"></div>
   ========================================================= */
(function () {
  "use strict";

  function normalizeColor(hex) {
    var n = parseInt(String(hex).replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* ---------- Mini WebGL ---------- */
  function MiniGl(canvas) {
    var gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL tidak didukung");
    this.canvas = canvas;
    this.gl = gl;
    this.meshes = [];
    var self = this;

    function Uniform(o) {
      this.type = "float";
      Object.assign(this, o);
      var map = { float: "1f", int: "1i", vec2: "2fv", vec3: "3fv", vec4: "4fv", mat4: "Matrix4fv" };
      this.typeFn = map[this.type] || "1f";
    }
    Uniform.prototype.update = function (loc) {
      if (this.value === undefined || loc === null) return;
      var fn = "uniform" + this.typeFn;
      if (this.typeFn.indexOf("Matrix") === 0) gl[fn](loc, false, this.value);
      else gl[fn](loc, this.value);
    };
    Uniform.prototype.getDeclaration = function (name, type, length) {
      if (this.excludeFrom === type) return "";
      if (this.type === "array") {
        return this.value[0].getDeclaration(name, type, this.value.length) +
          "\nconst int " + name + "_length = " + this.value.length + ";";
      }
      if (this.type === "struct") {
        var s = name.replace("u_", "");
        s = s.charAt(0).toUpperCase() + s.slice(1);
        var fields = Object.keys(this.value).map(function (k) {
          return self.declOf(this.value[k], k, type).replace(/^uniform/, "");
        }, this).join("");
        return "uniform struct " + s + " {\n" + fields + "\n} " + name + (length ? "[" + length + "]" : "") + ";";
      }
      return "uniform " + this.type + " " + name + (length ? "[" + length + "]" : "") + ";";
    };
    this.declOf = function (u, name, type) { return u.getDeclaration(name, type); };
    this.Uniform = Uniform;

    function Attribute(o) {
      this.type = gl.FLOAT;
      this.normalized = false;
      this.buffer = gl.createBuffer();
      Object.assign(this, o);
    }
    Attribute.prototype.update = function () {
      if (!this.values) return;
      gl.bindBuffer(this.target, this.buffer);
      gl.bufferData(this.target, this.values, gl.STATIC_DRAW);
    };
    Attribute.prototype.attach = function (name, program) {
      var loc = gl.getAttribLocation(program, name);
      if (this.target === gl.ARRAY_BUFFER && loc >= 0) {
        gl.bindBuffer(this.target, this.buffer);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, this.size, this.type, this.normalized, 0, 0);
      }
      return loc;
    };
    Attribute.prototype.use = function (loc) {
      gl.bindBuffer(this.target, this.buffer);
      if (this.target === gl.ARRAY_BUFFER && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, this.size, this.type, this.normalized, 0, 0);
      }
    };
    this.Attribute = Attribute;

    function decls(uniforms, type) {
      return Object.keys(uniforms).map(function (k) { return uniforms[k].getDeclaration(k, type); }).join("\n");
    }
    function shader(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    function Material(vs, fs, uniforms) {
      this.uniforms = uniforms || {};
      this.uniformInstances = [];
      var pre = "precision highp float;\n";
      var vSrc = pre + "attribute vec4 position;\nattribute vec2 uv;\nattribute vec2 uvNorm;\n" +
        decls(self.commonUniforms, "vertex") + "\n" + decls(this.uniforms, "vertex") + "\n" + vs;
      var fSrc = pre + decls(self.commonUniforms, "fragment") + "\n" + decls(this.uniforms, "fragment") + "\n" + fs;
      this.program = gl.createProgram();
      gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vSrc));
      gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fSrc));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      this.attachUniforms(undefined, self.commonUniforms);
      this.attachUniforms(undefined, this.uniforms);
    }
    Material.prototype.attachUniforms = function (name, u) {
      var m = this;
      if (name === undefined) {
        Object.keys(u).forEach(function (k) { m.attachUniforms(k, u[k]); });
      } else if (u.type === "array") {
        u.value.forEach(function (v, i) { m.attachUniforms(name + "[" + i + "]", v); });
      } else if (u.type === "struct") {
        Object.keys(u.value).forEach(function (k) { m.attachUniforms(name + "." + k, u.value[k]); });
      } else {
        m.uniformInstances.push({ uniform: u, location: gl.getUniformLocation(m.program, name) });
      }
    };
    this.Material = Material;

    function PlaneGeometry() {
      this.xSegCount = 1; this.ySegCount = 1; this.vertexCount = 4;
      this.attributes = {
        position: new Attribute({ target: gl.ARRAY_BUFFER, size: 3 }),
        uv: new Attribute({ target: gl.ARRAY_BUFFER, size: 2 }),
        uvNorm: new Attribute({ target: gl.ARRAY_BUFFER, size: 2 }),
        index: new Attribute({ target: gl.ELEMENT_ARRAY_BUFFER, size: 3, type: gl.UNSIGNED_SHORT })
      };
    }
    PlaneGeometry.prototype.setTopology = function (xs, ys) {
      this.xSegCount = xs; this.ySegCount = ys;
      this.vertexCount = (xs + 1) * (ys + 1);
      var a = this.attributes;
      a.uv.values = new Float32Array(2 * this.vertexCount);
      a.uvNorm.values = new Float32Array(2 * this.vertexCount);
      a.index.values = new Uint16Array(6 * xs * ys);
      for (var y = 0; y <= ys; y++) {
        for (var x = 0; x <= xs; x++) {
          var i = y * (xs + 1) + x;
          a.uv.values[2 * i] = x / xs;
          a.uv.values[2 * i + 1] = 1 - y / ys;
          a.uvNorm.values[2 * i] = (x / xs) * 2 - 1;
          a.uvNorm.values[2 * i + 1] = 1 - (y / ys) * 2;
          if (x < xs && y < ys) {
            var s = y * xs + x;
            a.index.values[6 * s] = i;
            a.index.values[6 * s + 1] = i + 1 + xs;
            a.index.values[6 * s + 2] = i + 1;
            a.index.values[6 * s + 3] = i + 1;
            a.index.values[6 * s + 4] = i + 1 + xs;
            a.index.values[6 * s + 5] = i + 2 + xs;
          }
        }
      }
      a.uv.update(); a.uvNorm.update(); a.index.update();
    };
    PlaneGeometry.prototype.setSize = function (w, h) {
      var p = new Float32Array(3 * this.vertexCount);
      var ox = w / -2, oy = h / -2, sw = w / this.xSegCount, sh = h / this.ySegCount;
      for (var y = 0; y <= this.ySegCount; y++) {
        for (var x = 0; x <= this.xSegCount; x++) {
          var i = y * (this.xSegCount + 1) + x;
          p[3 * i] = ox + x * sw;
          p[3 * i + 1] = -(oy + y * sh);
          p[3 * i + 2] = 0;
        }
      }
      this.attributes.position.values = p;
      this.attributes.position.update();
    };
    this.PlaneGeometry = PlaneGeometry;

    function Mesh(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.attributeInstances = [];
      var me = this;
      Object.keys(geometry.attributes).forEach(function (k) {
        var at = geometry.attributes[k];
        me.attributeInstances.push({ attribute: at, location: at.attach(k, material.program) });
      });
      self.meshes.push(this);
    }
    Mesh.prototype.draw = function () {
      gl.useProgram(this.material.program);
      this.material.uniformInstances.forEach(function (u) { u.uniform.update(u.location); });
      this.attributeInstances.forEach(function (a) { a.attribute.use(a.location); });
      gl.drawElements(gl.TRIANGLES, this.geometry.attributes.index.values.length, gl.UNSIGNED_SHORT, 0);
    };
    this.Mesh = Mesh;

    var I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    this.commonUniforms = {
      projectionMatrix: new Uniform({ type: "mat4", value: I }),
      modelViewMatrix: new Uniform({ type: "mat4", value: I }),
      resolution: new Uniform({ type: "vec2", value: [1, 1] }),
      aspectRatio: new Uniform({ type: "float", value: 1 })
    };
  }
  MiniGl.prototype.setSize = function (w, h) {
    this.width = w; this.height = h;
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.commonUniforms.resolution.value = [w, h];
    this.commonUniforms.aspectRatio.value = w / h;
  };
  MiniGl.prototype.setOrthographicCamera = function () {
    this.commonUniforms.projectionMatrix.value = [
      2 / this.width, 0, 0, 0, 0, 2 / this.height, 0, 0, 0, 0, -0.001, 0, 0, 0, 0, 1
    ];
  };
  MiniGl.prototype.render = function () {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clearDepth(1);
    this.meshes.forEach(function (m) { m.draw(); });
  };

  /* ---------- Shader ---------- */
  var VERTEX = [
    "vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}",
    "vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}",
    "float snoise(vec3 v){",
    " const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);",
    " vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);",
    " vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);",
    " vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);",
    " vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));",
    " float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;",
    " vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);",
    " vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);",
    " vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);",
    " vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));",
    " vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;",
    " vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);",
    " vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));",
    " p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;",
    " vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;",
    " return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));",
    "}",
    "vec3 blendNormal(vec3 base,vec3 blend,float opacity){return (blend*opacity+base*(1.0-opacity));}",
    "varying vec3 v_color;",
    "void main(){",
    " float time=u_time*u_global.noiseSpeed;",
    " vec2 noiseCoord=resolution*uvNorm*u_global.noiseFreq;",
    " float tilt=resolution.y/2.0*uvNorm.y;",
    " float incline=resolution.x*uvNorm.x/2.0*u_vertDeform.incline;",
    " float offset=resolution.x/2.0*u_vertDeform.incline*mix(u_vertDeform.offsetBottom,u_vertDeform.offsetTop,uv.y);",
    " float noise=snoise(vec3(noiseCoord.x*u_vertDeform.noiseFreq.x+time*u_vertDeform.noiseFlow,",
    "   noiseCoord.y*u_vertDeform.noiseFreq.y, time*u_vertDeform.noiseSpeed+u_vertDeform.noiseSeed))*u_vertDeform.noiseAmp;",
    " noise*=1.0-pow(abs(uvNorm.y),2.0); noise=max(0.0,noise);",
    " vec3 pos=vec3(position.x,position.y+tilt+incline+noise-offset,position.z);",
    " v_color=u_baseColor;",
    " for(int i=0;i<u_waveLayers_length;i++){",
    "   WaveLayers layer=u_waveLayers[i];",
    "   float ln=smoothstep(layer.noiseFloor,layer.noiseCeil,",
    "     snoise(vec3(noiseCoord.x*layer.noiseFreq.x+time*layer.noiseFlow,noiseCoord.y*layer.noiseFreq.y,time*layer.noiseSpeed+layer.noiseSeed))/2.0+0.5);",
    "   v_color=blendNormal(v_color,layer.color,pow(ln,4.0));",
    " }",
    " gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);",
    "}"
  ].join("\n");

  var FRAGMENT = [
    "varying vec3 v_color;",
    "void main(){",
    " vec3 color=v_color;",
    " if(u_darken_top==1.0){ vec2 st=gl_FragCoord.xy/resolution.xy; color.g-=pow(st.y+sin(-12.0)*st.x,u_shadow_power)*0.4; }",
    " gl_FragColor=vec4(color,1.0);",
    "}"
  ].join("\n");

  /* ---------- Gradient ---------- */
  function Gradient(container, colors) {
    this.container = container;
    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
    container.appendChild(this.canvas);
    this.gl = new MiniGl(this.canvas);
    this.time = 1200; this.last = 0; this.playing = false;

    var U = this.gl.Uniform, c = colors.map(normalizeColor);
    var uniforms = {
      u_time: new U({ value: 0 }),
      u_shadow_power: new U({ value: 8 }),
      u_darken_top: new U({ value: 0 }),
      u_global: new U({ type: "struct", value: {
        noiseFreq: new U({ type: "vec2", value: [0.0001, 0.0009] }),
        noiseSpeed: new U({ value: 0.00001 })
      } }),
      u_vertDeform: new U({ type: "struct", excludeFrom: "fragment", value: {
        incline: new U({ value: 0 }),
        offsetTop: new U({ value: -0.5 }),
        offsetBottom: new U({ value: -0.5 }),
        noiseFreq: new U({ type: "vec2", value: [3, 4] }),
        noiseAmp: new U({ value: 320 }),
        noiseSpeed: new U({ value: 10 }),
        noiseFlow: new U({ value: 3 }),
        noiseSeed: new U({ value: 5 })
      } }),
      u_baseColor: new U({ type: "vec3", excludeFrom: "fragment", value: c[0] }),
      u_waveLayers: new U({ type: "array", excludeFrom: "fragment", value: [] })
    };
    for (var i = 1; i < c.length; i++) {
      uniforms.u_waveLayers.value.push(new U({ type: "struct", value: {
        color: new U({ type: "vec3", value: c[i] }),
        noiseFreq: new U({ type: "vec2", value: [2 + i / c.length, 3 + i / c.length] }),
        noiseSpeed: new U({ value: 11 + 0.3 * i }),
        noiseFlow: new U({ value: 6.5 + 0.3 * i }),
        noiseSeed: new U({ value: 5 + 10 * i }),
        noiseFloor: new U({ value: 0.1 }),
        noiseCeil: new U({ value: 0.63 + 0.07 * i })
      } }));
    }
    this.uniforms = uniforms;
    this.mesh = new this.gl.Mesh(new this.gl.PlaneGeometry(), new this.gl.Material(VERTEX, FRAGMENT, uniforms));
    this.resize();

    var self = this;
    this.animate = function (ts) {
      if (!self.playing) return;
      self.time += Math.min(ts - self.last, 1000 / 15);
      self.last = ts;
      self.draw();
      self.raf = requestAnimationFrame(self.animate);
    };
  }
  Gradient.prototype.resize = function () {
    var w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.gl.setSize(w, h);
    this.gl.setOrthographicCamera();
    this.mesh.geometry.setTopology(Math.ceil(w * 0.02), Math.ceil(h * 0.05));
    this.mesh.geometry.setSize(w, h);
  };
  Gradient.prototype.draw = function () {
    this.uniforms.u_time.value = this.time;
    this.gl.render();
  };
  Gradient.prototype.start = function () {
    if (this.playing) return;
    this.playing = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.animate);
  };
  Gradient.prototype.stop = function () {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  /* ---------- Pasang otomatis ---------- */
  function mount(el) {
    var colors = (el.getAttribute("data-colors") || "#ccfbf1,#ffffff,#5eead4,#f0fdfa")
      .split(",").map(function (s) { return s.trim(); });
    var g;
    try { g = new Gradient(el, colors); } catch (e) { console.warn("Gradient Wave nonaktif:", e.message); return; }
    el.classList.add("is-ready");

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    g.draw();
    if (reduce) return;

    var visible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && !document.hidden) g.start(); else g.stop();
      }).observe(el);
    } else g.start();
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) g.stop(); else if (visible) g.start();
    });

    var t;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { g.resize(); g.draw(); }, 150);
    });
  }

  function init() { document.querySelectorAll("[data-gradient-wave]").forEach(mount); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
