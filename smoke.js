  (window.hookBannerEffect = {}), (hookBannerEffect.isMobile = !1), (hookBannerEffect.pointer = null);
  var canvas = document.getElementById("smoke-background");
  (canvas.width = window.innerWidth), (canvas.height = window.innerHeight);
  var config = {
      TEXTURE_DOWNSAMPLE: 1,
      DENSITY_DISSIPATION: 0.98,
      VELOCITY_DISSIPATION: 0.99,
      PRESSURE_DISSIPATION: 0.8,
      PRESSURE_ITERATIONS: 20,
      CURL: 0,
      SPLAT_RADIUS: 0.0035,
    },
    pointers = [],
    splatStack = [],
    ref = getWebGLContext(canvas),
    gl = ref.gl,
    ext = ref.ext;
  function getWebGLContext(e) {
    var r,
      t,
      n = {
        alpha: !0,
        depth: !1,
        stencil: !1,
        antialias: !1,
      },
      i = e.getContext("webgl2", n),
      a = !!i;
    a || (i = e.getContext("webgl", n) || e.getContext("experimental-webgl", n)), a ? (i.getExtension("EXT_color_buffer_float"), (t = i.getExtension("OES_texture_float_linear"))) : ((r = i.getExtension("OES_texture_half_float")), (t = i.getExtension("OES_texture_half_float_linear"))), i.clearColor(0, 0, 0, 0);
    var o,
      l,
      u,
      g = a ? i.HALF_FLOAT : r.HALF_FLOAT_OES;
    return (
      a ? ((o = getSupportedFormat(i, i.RGBA16F, i.RGBA, g)), (l = getSupportedFormat(i, i.RG16F, i.RG, g)), (u = getSupportedFormat(i, i.R16F, i.RED, g))) : ((o = getSupportedFormat(i, i.RGBA, i.RGBA, g)), (l = getSupportedFormat(i, i.RGBA, i.RGBA, g)), (u = getSupportedFormat(i, i.RGBA, i.RGBA, g))),
      i.clearColor(0.5, 0, 0, 0.5),
      i.clear(i.COLOR_BUFFER_BIT),
      {
        gl: i,
        ext: {
          formatRGBA: o,
          formatRG: l,
          formatR: u,
          halfFloatTexType: g,
          supportLinearFiltering: t,
        },
      }
    );
  }
  function getSupportedFormat(e, r, t, n) {
    if (!supportRenderTextureFormat(e, r, t, n))
      switch (r) {
        case e.R16F:
          return getSupportedFormat(e, e.RG16F, e.RG, n);
        case e.RG16F:
          return getSupportedFormat(e, e.RGBA16F, e.RGBA, n);
        default:
          return null;
      }
    return {
      internalFormat: r,
      format: t,
    };
  }
  function supportRenderTextureFormat(e, r, t, n) {
    var i = e.createTexture();
    e.bindTexture(e.TEXTURE_2D, i), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(e.TEXTURE_2D, 0, r, 4, 4, 0, t, n, null);
    var a = e.createFramebuffer();
    return e.bindFramebuffer(e.FRAMEBUFFER, a), e.framebufferTexture2D(e.FRAMEBUFFER, e.COLOR_ATTACHMENT0, e.TEXTURE_2D, i, 0), e.checkFramebufferStatus(e.FRAMEBUFFER) == e.FRAMEBUFFER_COMPLETE;
  }
  function startGUI() {
    var e = new dat.GUI({
      width: 300,
    });
    e
      .add(config, "TEXTURE_DOWNSAMPLE", {
        Full: 0,
        Half: 1,
        Quarter: 2,
      })
      .name("resolution")
      .onFinishChange(initFramebuffers),
      e.add(config, "DENSITY_DISSIPATION", 0.9, 1).name("density diffusion"),
      e.add(config, "VELOCITY_DISSIPATION", 0.9, 1).name("velocity diffusion"),
      e.add(config, "PRESSURE_DISSIPATION", 0, 1).name("pressure diffusion"),
      e.add(config, "PRESSURE_ITERATIONS", 1, 60).name("iterations"),
      e.add(config, "CURL", 0, 50).name("vorticity").step(1),
      e.add(config, "SPLAT_RADIUS", 1e-4, 0.01).name("splat radius"),
      e
        .add(
          {
            fun: function () {
              splatStack.push(parseInt(20 * Math.random()) + 5);
            },
          },
          "fun"
        )
        .name("Random splats"),
      e.close();
  }
  function pointerPrototype() {
    (this.id = -1), (this.x = 0), (this.y = 0), (this.dx = 0), (this.dy = 0), (this.down = !1), (this.moved = !1), (this.color = [30, 0, 300]);
  }
  pointers.push(new pointerPrototype());
  var GLProgram = function (e, r) {
    if (((this.uniforms = {}), (this.program = gl.createProgram()), gl.attachShader(this.program, e), gl.attachShader(this.program, r), gl.linkProgram(this.program), !gl.getProgramParameter(this.program, gl.LINK_STATUS))) throw gl.getProgramInfoLog(this.program);
    for (var t = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS), n = 0; n < t; n++) {
      var i = gl.getActiveUniform(this.program, n).name;
      this.uniforms[i] = gl.getUniformLocation(this.program, i);
    }
  };
  function compileShader(e, r) {
    var t = gl.createShader(e);
    if ((gl.shaderSource(t, r), gl.compileShader(t), !gl.getShaderParameter(t, gl.COMPILE_STATUS))) throw gl.getShaderInfoLog(t);
    return t;
  }
  GLProgram.prototype.bind = function () {
    gl.useProgram(this.program);
  };
  var textureWidth,
    textureHeight,
    density,
    velocity,
    divergence,
    curl,
    pressure,
    baseVertexShader = compileShader(
      gl.VERTEX_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    attribute vec2 aPosition;\n    varying vec2 vUv;\n    varying vec2 vL;\n    varying vec2 vR;\n    varying vec2 vT;\n    varying vec2 vB;\n    uniform vec2 texelSize;\n\n    void main () {\n        vUv = aPosition * 0.5 + 0.5;\n        vL = vUv - vec2(texelSize.x, 0.0);\n        vR = vUv + vec2(texelSize.x, 0.0);\n        vT = vUv + vec2(0.0, texelSize.y);\n        vB = vUv - vec2(0.0, texelSize.y);\n        gl_Position = vec4(aPosition, 0.0, 1.0);\n    }\n"
    ),
    clearShader = compileShader(gl.FRAGMENT_SHADER, "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    uniform sampler2D uTexture;\n    uniform float value;\n\n    void main () {\n        gl_FragColor = value * texture2D(uTexture, vUv);\n    }\n"),
    displayShader = compileShader(gl.FRAGMENT_SHADER, "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    uniform sampler2D uTexture;\n\n    void main () {\n        gl_FragColor = texture2D(uTexture, vUv);\n    }\n"),
    splatShader = compileShader(
      gl.FRAGMENT_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    uniform sampler2D uTarget;\n    uniform float aspectRatio;\n    uniform vec3 color;\n    uniform vec2 point;\n    uniform float radius;\n\n    void main () {\n        vec2 p = vUv - point.xy;\n        p.x *= aspectRatio;\n        vec3 splat = exp(-dot(p, p) / radius) * color;\n        vec3 base = texture2D(uTarget, vUv).xyz;\n        gl_FragColor = vec4(base + splat, 1.0);\n    }\n"
    ),
    advectionManualFilteringShader = compileShader(
      gl.FRAGMENT_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    uniform sampler2D uVelocity;\n    uniform sampler2D uSource;\n    uniform vec2 texelSize;\n    uniform float dt;\n    uniform float dissipation;\n\n    vec4 bilerp (in sampler2D sam, in vec2 p) {\n        vec4 st;\n        st.xy = floor(p - 0.5) + 0.5;\n        st.zw = st.xy + 1.0;\n        vec4 uv = st * texelSize.xyxy;\n        vec4 a = texture2D(sam, uv.xy);\n        vec4 b = texture2D(sam, uv.zy);\n        vec4 c = texture2D(sam, uv.xw);\n        vec4 d = texture2D(sam, uv.zw);\n        vec2 f = p - st.xy;\n        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);\n    }\n\n    void main () {\n        vec2 coord = gl_FragCoord.xy - dt * texture2D(uVelocity, vUv).xy;\n        gl_FragColor = dissipation * bilerp(uSource, coord);\n        gl_FragColor.a = 1.0;\n    }\n"
    ),
    advectionShader = compileShader(gl.FRAGMENT_SHADER, "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    uniform sampler2D uVelocity;\n    uniform sampler2D uSource;\n    uniform vec2 texelSize;\n    uniform float dt;\n    uniform float dissipation;\n\n    void main () {\n        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;\n        gl_FragColor = dissipation * texture2D(uSource, coord);\n        gl_FragColor.a = 1.0;\n    }\n"),
    divergenceShader = compileShader(
      gl.FRAGMENT_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    varying vec2 vL;\n    varying vec2 vR;\n    varying vec2 vT;\n    varying vec2 vB;\n    uniform sampler2D uVelocity;\n\n    vec2 sampleVelocity (in vec2 uv) {\n        vec2 multiplier = vec2(1.0, 1.0);\n        if (uv.x < 0.0) { uv.x = 0.0; multiplier.x = -1.0; }\n        if (uv.x > 1.0) { uv.x = 1.0; multiplier.x = -1.0; }\n        if (uv.y < 0.0) { uv.y = 0.0; multiplier.y = -1.0; }\n        if (uv.y > 1.0) { uv.y = 1.0; multiplier.y = -1.0; }\n        return multiplier * texture2D(uVelocity, uv).xy;\n    }\n\n    void main () {\n        float L = sampleVelocity(vL).x;\n        float R = sampleVelocity(vR).x;\n        float T = sampleVelocity(vT).y;\n        float B = sampleVelocity(vB).y;\n        float div = 0.5 * (R - L + T - B);\n        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);\n    }\n"
    ),
    curlShader = compileShader(
      gl.FRAGMENT_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    varying vec2 vL;\n    varying vec2 vR;\n    varying vec2 vT;\n    varying vec2 vB;\n    uniform sampler2D uVelocity;\n\n    void main () {\n        float L = texture2D(uVelocity, vL).y;\n        float R = texture2D(uVelocity, vR).y;\n        float T = texture2D(uVelocity, vT).x;\n        float B = texture2D(uVelocity, vB).x;\n        float vorticity = R - L - T + B;\n        gl_FragColor = vec4(vorticity, 0.0, 0.0, 1.0);\n    }\n"
    ),
    vorticityShader = compileShader(
      gl.FRAGMENT_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    varying vec2 vT;\n    varying vec2 vB;\n    uniform sampler2D uVelocity;\n    uniform sampler2D uCurl;\n    uniform float curl;\n    uniform float dt;\n\n    void main () {\n        float T = texture2D(uCurl, vT).x;\n        float B = texture2D(uCurl, vB).x;\n        float C = texture2D(uCurl, vUv).x;\n        vec2 force = vec2(abs(T) - abs(B), 0.0);\n        force *= 1.0 / length(force + 0.00001) * curl * C;\n        vec2 vel = texture2D(uVelocity, vUv).xy;\n        gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);\n    }\n"
    ),
    pressureShader = compileShader(
      gl.FRAGMENT_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    varying vec2 vL;\n    varying vec2 vR;\n    varying vec2 vT;\n    varying vec2 vB;\n    uniform sampler2D uPressure;\n    uniform sampler2D uDivergence;\n\n    vec2 boundary (in vec2 uv) {\n        uv = min(max(uv, 0.0), 1.0);\n        return uv;\n    }\n\n    void main () {\n        float L = texture2D(uPressure, boundary(vL)).x;\n        float R = texture2D(uPressure, boundary(vR)).x;\n        float T = texture2D(uPressure, boundary(vT)).x;\n        float B = texture2D(uPressure, boundary(vB)).x;\n        float C = texture2D(uPressure, vUv).x;\n        float divergence = texture2D(uDivergence, vUv).x;\n        float pressure = (L + R + B + T - divergence) * 0.25;\n        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);\n    }\n"
    ),
    gradientSubtractShader = compileShader(
      gl.FRAGMENT_SHADER,
      "\n    precision highp float;\n    precision mediump sampler2D;\n\n    varying vec2 vUv;\n    varying vec2 vL;\n    varying vec2 vR;\n    varying vec2 vT;\n    varying vec2 vB;\n    uniform sampler2D uPressure;\n    uniform sampler2D uVelocity;\n\n    vec2 boundary (in vec2 uv) {\n        uv = min(max(uv, 0.0), 1.0);\n        return uv;\n    }\n\n    void main () {\n        float L = texture2D(uPressure, boundary(vL)).x;\n        float R = texture2D(uPressure, boundary(vR)).x;\n        float T = texture2D(uPressure, boundary(vT)).x;\n        float B = texture2D(uPressure, boundary(vB)).x;\n        vec2 velocity = texture2D(uVelocity, vUv).xy;\n        velocity.xy -= vec2(R - L, T - B);\n        gl_FragColor = vec4(velocity, 0.0, 1.0);\n    }\n"
    );
  initFramebuffers();
  var clearProgram = new GLProgram(baseVertexShader, clearShader),
    displayProgram = new GLProgram(baseVertexShader, displayShader),
    splatProgram = new GLProgram(baseVertexShader, splatShader),
    advectionProgram = new GLProgram(baseVertexShader, ext.supportLinearFiltering ? advectionShader : advectionManualFilteringShader),
    divergenceProgram = new GLProgram(baseVertexShader, divergenceShader),
    curlProgram = new GLProgram(baseVertexShader, curlShader),
    vorticityProgram = new GLProgram(baseVertexShader, vorticityShader),
    pressureProgram = new GLProgram(baseVertexShader, pressureShader),
    gradienSubtractProgram = new GLProgram(baseVertexShader, gradientSubtractShader);
  function initFramebuffers() {
    (textureWidth = gl.drawingBufferWidth >> config.TEXTURE_DOWNSAMPLE), (textureHeight = gl.drawingBufferHeight >> config.TEXTURE_DOWNSAMPLE);
    var e = ext.halfFloatTexType,
      r = ext.formatRGBA,
      t = ext.formatRG,
      n = ext.formatR;
    (density = createDoubleFBO(2, textureWidth, textureHeight, r.internalFormat, r.format, e, ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST)),
      (velocity = createDoubleFBO(0, textureWidth, textureHeight, t.internalFormat, t.format, e, ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST)),
      (divergence = createFBO(4, textureWidth, textureHeight, n.internalFormat, n.format, e, gl.NEAREST)),
      (curl = createFBO(5, textureWidth, textureHeight, n.internalFormat, n.format, e, gl.NEAREST)),
      (pressure = createDoubleFBO(6, textureWidth, textureHeight, n.internalFormat, n.format, e, gl.NEAREST));
  }
  function createFBO(e, r, t, n, i, a, o) {
    gl.activeTexture(gl.TEXTURE0 + e);
    var l = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, l), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, o), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE), gl.texImage2D(gl.TEXTURE_2D, 0, n, r, t, 0, i, a, null);
    var u = gl.createFramebuffer();
    gl.clearColor(0, 0, 0, 0);
    return gl.bindFramebuffer(gl.FRAMEBUFFER, u), gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, l, 0), gl.viewport(0, 0, r, t), gl.clear(gl.COLOR_BUFFER_BIT), [l, u, e];
  }
  function createDoubleFBO(e, r, t, n, i, a, o) {
    var l = createFBO(e, r, t, n, i, a, o),
      u = createFBO(e + 1, r, t, n, i, a, o);
    return {
      get read() {
        return l;
      },
      get write() {
        return u;
      },
      swap: function () {
        var e = l;
        (l = u), (u = e);
      },
    };
  }
  var blit =
      (gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()),
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW),
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()),
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW),
      gl.vertexAttribPointer(0, 2, gl.FLOAT, !1, 0, 0),
      gl.enableVertexAttribArray(0),
      function (e) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, e), gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      }),
    lastTime = Date.now();
  function update() {
    resizeCanvas();
    var e = Math.min((Date.now() - lastTime) / 1e3, 0.016);
    (lastTime = Date.now()),
      gl.viewport(0, 0, textureWidth, textureHeight),
      splatStack.length > 0 && multipleSplats(splatStack.pop()),
      advectionProgram.bind(),
      gl.uniform2f(advectionProgram.uniforms.texelSize, 1 / textureWidth, 1 / textureHeight),
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read[2]),
      gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read[2]),
      gl.uniform1f(advectionProgram.uniforms.dt, e),
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION),
      blit(velocity.write[1]),
      velocity.swap(),
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read[2]),
      gl.uniform1i(advectionProgram.uniforms.uSource, density.read[2]),
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION),
      blit(density.write[1]),
      density.swap();
    for (var r = 0; r < pointers.length; r++) {
      var t = pointers[r];
      (t.moved || !0 === hookBannerEffect.isMobile) && (splat(t.x, t.y, t.dx, t.dy, t.color), (t.moved = !1));
    }
    curlProgram.bind(),
      gl.uniform2f(curlProgram.uniforms.texelSize, 1 / textureWidth, 1 / textureHeight),
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read[2]),
      blit(curl[1]),
      vorticityProgram.bind(),
      gl.uniform2f(vorticityProgram.uniforms.texelSize, 1 / textureWidth, 1 / textureHeight),
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read[2]),
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl[2]),
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL),
      gl.uniform1f(vorticityProgram.uniforms.dt, e),
      blit(velocity.write[1]),
      velocity.swap(),
      divergenceProgram.bind(),
      gl.uniform2f(divergenceProgram.uniforms.texelSize, 1 / textureWidth, 1 / textureHeight),
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read[2]),
      blit(divergence[1]),
      clearProgram.bind();
    var n = pressure.read[2];
    gl.activeTexture(gl.TEXTURE0 + n),
      gl.bindTexture(gl.TEXTURE_2D, pressure.read[0]),
      gl.uniform1i(clearProgram.uniforms.uTexture, n),
      gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE_DISSIPATION),
      blit(pressure.write[1]),
      pressure.swap(),
      pressureProgram.bind(),
      gl.uniform2f(pressureProgram.uniforms.texelSize, 1 / textureWidth, 1 / textureHeight),
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence[2]),
      (n = pressure.read[2]),
      gl.uniform1i(pressureProgram.uniforms.uPressure, n),
      gl.activeTexture(gl.TEXTURE0 + n);
    for (var i = 0; i < config.PRESSURE_ITERATIONS; i++) gl.bindTexture(gl.TEXTURE_2D, pressure.read[0]), blit(pressure.write[1]), pressure.swap();
    gradienSubtractProgram.bind(),
      gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, 1 / textureWidth, 1 / textureHeight),
      gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read[2]),
      gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read[2]),
      blit(velocity.write[1]),
      velocity.swap(),
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight),
      displayProgram.bind(),
      gl.uniform1i(displayProgram.uniforms.uTexture, density.read[2]),
      blit(null),
      requestAnimationFrame(update);
  }
  function splat(e, r, t, n, i) {
    splatProgram.bind(),
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read[2]),
      gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height),
      gl.uniform2f(splatProgram.uniforms.point, e / canvas.width, 1 - r / canvas.height),
      gl.uniform3f(splatProgram.uniforms.color, t, -n, 1),
      gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS),
      blit(velocity.write[1]),
      velocity.swap(),
      gl.uniform1i(splatProgram.uniforms.uTarget, density.read[2]),
      gl.uniform3f(splatProgram.uniforms.color, 0.3 * i[0], 0.3 * i[1], 0.45 * i[2]),
      blit(density.write[1]),
      density.swap();
  }
  function multipleSplats(e) {
    for (var r = 0; r < e; r++) {
      splat(canvas.width * Math.random(), canvas.height * Math.random(), 1e3 * (Math.random() - 0.5), 1e3 * (Math.random() - 0.5), [0.44, 0, 0.61]);
    }
  }
  function resizeCanvas() {
    (canvas.width = window.innerWidth), (canvas.height = window.innerHeight), (canvas.width == window.innerWidth && canvas.height == window.innerHeight) || ((canvas.width = window.innerWidth), (canvas.height = window.innerHeight), initFramebuffers());
  }
  // multipleSplats(parseInt(20 * Math.random()) + 5),
  update(),
    window.addEventListener("mousemove", function (e) {
      if (!0 === hookBannerEffect.isMobile) return null;
      var x = e.x;
      var y = e.y;
      (pointers[0].moved = pointers[0].down), (pointers[0].dx = 10 * (x - pointers[0].x)), (pointers[0].dy = 10 * (y - pointers[0].y)), (pointers[0].x = x), (pointers[0].y = y);
    }),
    window.addEventListener(
      "touchmove",
      function (e) {
        if ((e.preventDefault(), !0 === hookBannerEffect.isMobile)) return null;
        for (var r = e.targetTouches, t = 0; t < r.length && !(t > 0); t++) {
          var n = pointers[t];
          (n.moved = n.down), (n.dx = 10 * (r[t].screenX - n.x)), (n.dy = 10 * (r[t].screenY - n.y)), (n.x = r[t].screenX), (n.y = r[t].screenY);
        }
      },
      !1
    ),
    window.addEventListener("touchstart", function (e) {
      if ((e.preventDefault(), !0 === hookBannerEffect.isMobile)) return null;
      for (var r = e.targetTouches, t = 0; t < r.length; t++) {
        t >= pointers.length && pointers.push(new pointerPrototype()), (pointers[t].id = r[t].identifier), (pointers[t].down = !0), (pointers[t].x = r[t].screenX), (pointers[t].y = r[t].screenY);
        Math.random(), Math.random(), Math.random();
        pointers[t].color = [0.91, 0.72, 0.23];
      }
    }),
    window.addEventListener("mouseup", function () {}),
    window.addEventListener("touchend", function (e) {
      for (var r = e.changedTouches, t = 0; t < r.length; t++) for (var n = 0; n < pointers.length; n++) r[t].identifier == pointers[n].id && (pointers[n].down = !1);
    }),
    (pointers[0].down = !0);
  var color = [Math.random() + 0.2, Math.random() + 0.2, Math.random() + 0.2];
  color = [0.91, 0.72, 0.23];
  (pointers[0].color = color), (hookBannerEffect.pointer = pointers[0]), (window.myPointer = window.innerWidth / 2);
