(function () {
    "use strict";

    var DOT_INTERVAL_MS = 100;
    var MAX_DOTS = 30;
    var DOT_SIZE_PX = 2;
    var SPAWN_OFFSET_PX = 110;
    var CURSOR_SETTLE_RADIUS_PX = 3;
    var CHASE_DISTANCE_RANGE_PX = 260;
    var MIN_CHASE_SPEED = 0.11;
    var MAX_CHASE_SPEED = 0.54;
    var VELOCITY_SMOOTHING = 0.16;
    var MAX_CURVE_SPEED = 0.075;
    var MAX_WAVE_SPEED = 0.035;
    var SCATTER_RADIUS_PX = 20;
    var SCATTER_FORCE = 0.052;
    var PRESS_EXPLOSION_RADIUS_PX = 240;
    var PRESS_EXPLOSION_FORCE = 0.088;
    var FRICTION = 0.94;
    var MAX_SPEED = 1.92;
    var FRAME_STEP_LIMIT_MS = 34;
    var APPEAR_DURATION_MS = 420;
    var MAX_PIXEL_RATIO = 2;
    var TRAIL_ALPHA = 0.42;
    var INVISIBLE_RADIUS_PX = 20;
    var STILL_SPEED_PX_PER_MS = 0.035;
    var FADE_OUT_PER_MS = 0.003;
    var FADE_IN_PER_MS = 0.006;
    var reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var canvas;
    var drawingContext;
    var dots = [];
    var spawnTimer;
    var animationFrame;
    var lastFrameTime;
    var pointerPosition;
    var ambientDotsStarted = false;
    var canvasWidth = 0;
    var canvasHeight = 0;
    var dotColor;
    var accentDotColor;
    var dotGlowColor;
    var themeObserver;

    document.addEventListener("DOMContentLoaded", function () {
        installAmbientStyles();

        canvas = document.createElement("canvas");
        canvas.className = "ambient-background";
        canvas.setAttribute("aria-hidden", "true");
        drawingContext = canvas.getContext("2d");

        if (!drawingContext) {
            return;
        }

        document.body.prepend(canvas);
        resizeCanvas();
        readAmbientColors();

        window.addEventListener("pointermove", rememberPointerPosition, { passive: true });
        window.addEventListener("pointerdown", explodeDotsFromPointer, { passive: true });
        window.addEventListener("resize", resizeCanvas);

        if (reduceMotionQuery.addEventListener) {
            reduceMotionQuery.addEventListener("change", updateAmbientDots);
        }
        observeThemeChanges();
    });

    function installAmbientStyles() {
        if (document.getElementById("ambient-background-styles")) {
            return;
        }

        var style = document.createElement("style");
        style.id = "ambient-background-styles";
        style.textContent = [
            ".ambient-background {",
            "position: fixed !important;",
            "inset: 0 !important;",
            "z-index: 0 !important;",
            "display: block !important;",
            "width: 100vw !important;",
            "height: 100vh !important;",
            "overflow: hidden !important;",
            "pointer-events: none !important;",
            "user-select: none !important;",
            "}",
            "body > :not(dialog):not(.ambient-background) {",
            "position: relative;",
            "z-index: 1;",
            "}"
        ].join("");
        document.head.appendChild(style);
    }

    function rememberPointerPosition(event) {
        var nextPointerPosition = pointerFromEvent(event);

        if (!pointerPosition) {
            pointerPosition = nextPointerPosition;
            startAmbientDots();
            return;
        }

        scatterDotsBetween(pointerPosition, nextPointerPosition);
        pointerPosition = nextPointerPosition;
    }

    function explodeDotsFromPointer(event) {
        pointerPosition = pointerFromEvent(event);
        startAmbientDots();

        for (var dotIndex = 0; dotIndex < dots.length; dotIndex += 1) {
            explodeDotFromPoint(dots[dotIndex], pointerPosition, PRESS_EXPLOSION_RADIUS_PX, PRESS_EXPLOSION_FORCE);
        }
    }

    function updateAmbientDots() {
        window.clearInterval(spawnTimer);
        window.cancelAnimationFrame(animationFrame);
        clearDots();
        ambientDotsStarted = false;

        startAmbientDots();
    }

    function startAmbientDots() {
        if (ambientDotsStarted || reduceMotionQuery.matches || !pointerPosition) {
            return;
        }

        ambientDotsStarted = true;
        spawnDot();
        spawnTimer = window.setInterval(spawnDot, DOT_INTERVAL_MS);
        lastFrameTime = performance.now();
        animationFrame = window.requestAnimationFrame(animateDots);
    }

    function spawnDot() {
        if (!canvas || !pointerPosition) {
            return;
        }

        if (dots.length >= MAX_DOTS) {
            window.clearInterval(spawnTimer);
            return;
        }

        var left = pointerPosition.x + randomNumber(-SPAWN_OFFSET_PX, SPAWN_OFFSET_PX);
        var top = pointerPosition.y + randomNumber(-SPAWN_OFFSET_PX, SPAWN_OFFSET_PX);

        dots.push({
            x: clamp(left, 0, canvasWidth),
            y: clamp(top, 0, canvasHeight),
            previousX: clamp(left, 0, canvasWidth),
            previousY: clamp(top, 0, canvasHeight),
            velocityX: 0,
            velocityY: 0,
            personality: randomNumber(0.5, 1.5),
            curveStrength: randomCurveStrength(),
            waveOffset: randomNumber(0, Math.PI * 2),
            waveSpeedMultiplier: randomNumber(0.7, 1.3),
            accent: dots.length % 3 === 2,
            createdAt: performance.now(),
            visibility: 1
        });
    }

    function animateDots(timestamp) {
        var elapsed = Math.min(timestamp - lastFrameTime, FRAME_STEP_LIMIT_MS);
        lastFrameTime = timestamp;

        for (var dotIndex = dots.length - 1; dotIndex >= 0; dotIndex -= 1) {
            updateDot(dots[dotIndex], timestamp, elapsed);
        }

        clearCanvas();
        drawDots(timestamp);
        animationFrame = window.requestAnimationFrame(animateDots);
    }

    function updateDot(dot, timestamp, elapsed) {
        var distance = distanceToPointer(dot);
        pullDotTowardPointer(dot, distance, timestamp);

        dot.previousX = dot.x;
        dot.previousY = dot.y;
        dot.x += dot.velocityX * elapsed;
        dot.y += dot.velocityY * elapsed;

        var friction = Math.pow(FRICTION, elapsed / 16.67);
        dot.velocityX *= friction;
        dot.velocityY *= friction;

        keepDotInsideViewport(dot);
        updateDotVisibility(dot, distance, elapsed);
    }

    function distanceToPointer(dot) {
        return distanceBetween(dot, pointerPosition);
    }

    function pullDotTowardPointer(dot, distance, timestamp) {
        if (distance <= CURSOR_SETTLE_RADIUS_PX) {
            dot.velocityX *= 0.72;
            dot.velocityY *= 0.72;
            return;
        }

        var xDistance = pointerPosition.x - dot.x;
        var yDistance = pointerPosition.y - dot.y;
        var distanceRatio = clamp(distance / CHASE_DISTANCE_RANGE_PX, 0, 1);

        var targetSpeed = (
            MIN_CHASE_SPEED +
            (MAX_CHASE_SPEED - MIN_CHASE_SPEED) * distanceRatio
        ) * dot.personality;

        var directionX = xDistance / distance;
        var directionY = yDistance / distance;

        var tangentX = -directionY;
        var tangentY = directionX;

        var curveSpeed =
            dot.curveStrength *
            distanceRatio *
            targetSpeed /
            MAX_CHASE_SPEED;

        var waveSpeed =
            Math.sin(timestamp * 0.008 * dot.waveSpeedMultiplier + dot.waveOffset) *
            MAX_WAVE_SPEED *
            (0.35 + distanceRatio * 0.65);

        var sidewaysMotion = curveSpeed + waveSpeed;

        var targetVelocityX = directionX * targetSpeed + tangentX * sidewaysMotion;
        var targetVelocityY = directionY * targetSpeed + tangentY * sidewaysMotion;

        dot.velocityX += (targetVelocityX - dot.velocityX) * VELOCITY_SMOOTHING;
        dot.velocityY += (targetVelocityY - dot.velocityY) * VELOCITY_SMOOTHING;

        limitSpeed(dot);
    }

    function updateDotVisibility(dot, distance, elapsed) {
        var speed = magnitude(dot.velocityX, dot.velocityY);
        var targetVisibility = distance <= INVISIBLE_RADIUS_PX && speed <= STILL_SPEED_PX_PER_MS ? 0 : 1;
        var fadeRate = targetVisibility === 0 ? FADE_OUT_PER_MS : FADE_IN_PER_MS;
        var visibilityChange = fadeRate * elapsed;

        if (dot.visibility < targetVisibility) {
            dot.visibility = Math.min(dot.visibility + visibilityChange, targetVisibility);
            return;
        }

        if (dot.visibility > targetVisibility) {
            dot.visibility = Math.max(dot.visibility - visibilityChange, targetVisibility);
        }
    }

    function scatterDotsBetween(fromPosition, toPosition) {
        var xDistance = toPosition.x - fromPosition.x;
        var yDistance = toPosition.y - fromPosition.y;
        var pointerDistance = magnitude(xDistance, yDistance);

        if (pointerDistance < 0.5) {
            return;
        }

        for (var dotIndex = 0; dotIndex < dots.length; dotIndex += 1) {
            scatterDotFromPath(dots[dotIndex], fromPosition, xDistance, yDistance, pointerDistance);
        }
    }

    function scatterDotFromPath(dot, fromPosition, xDistance, yDistance, pointerDistance) {
        var pathProgress = (
            (dot.x - fromPosition.x) * xDistance +
            (dot.y - fromPosition.y) * yDistance
        ) / (pointerDistance * pointerDistance);

        var clampedPathProgress = clamp(pathProgress, 0, 1);
        var closestX = fromPosition.x + xDistance * clampedPathProgress;
        var closestY = fromPosition.y + yDistance * clampedPathProgress;

        pushDotAwayFromPoint(dot, { x: closestX, y: closestY }, SCATTER_RADIUS_PX, SCATTER_FORCE);
    }

    function explodeDotFromPoint(dot, point, radius, forceMultiplier) {
        pushDotAwayFromPoint(dot, point, radius, forceMultiplier);
    }

    function pushDotAwayFromPoint(dot, point, radius, forceMultiplier) {
        var xDistance = dot.x - point.x;
        var yDistance = dot.y - point.y;
        var distance = magnitude(xDistance, yDistance);

        if (distance > radius) {
            return;
        }

        if (distance < 0.5) {
            xDistance = randomNumber(-1, 1);
            yDistance = randomNumber(-1, 1);
            distance = magnitude(xDistance, yDistance);
        }

        var force = (radius - distance) * forceMultiplier;

        dot.velocityX += xDistance / distance * force;
        dot.velocityY += yDistance / distance * force;

        limitSpeed(dot);
    }

    function limitSpeed(dot) {
        var speed = magnitude(dot.velocityX, dot.velocityY);

        if (speed <= MAX_SPEED) {
            return;
        }

        dot.velocityX = dot.velocityX / speed * MAX_SPEED;
        dot.velocityY = dot.velocityY / speed * MAX_SPEED;
    }

    function resizeCanvas() {
        if (!canvas || !drawingContext) {
            return;
        }

        var pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        canvasWidth = window.innerWidth;
        canvasHeight = window.innerHeight;
        canvas.width = Math.ceil(canvasWidth * pixelRatio);
        canvas.height = Math.ceil(canvasHeight * pixelRatio);
        drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        keepDotsInsideViewport();
        clearCanvas();
        drawDots(performance.now());
    }

    function keepDotsInsideViewport() {
        for (var dotIndex = 0; dotIndex < dots.length; dotIndex += 1) {
            keepDotInsideViewport(dots[dotIndex]);
        }
    }

    function keepDotInsideViewport(dot) {
        if (dot.x < 0 || dot.x > canvasWidth) {
            dot.velocityX *= -0.35;
        }

        if (dot.y < 0 || dot.y > canvasHeight) {
            dot.velocityY *= -0.35;
        }

        dot.x = clamp(dot.x, 0, canvasWidth);
        dot.y = clamp(dot.y, 0, canvasHeight);
    }

    function drawDots(timestamp) {
        if (!drawingContext) {
            return;
        }

        drawingContext.save();
        drawingContext.lineCap = "square";
        drawingContext.lineWidth = DOT_SIZE_PX;

        for (var trailIndex = 0; trailIndex < dots.length; trailIndex += 1) {
            drawDotTrail(dots[trailIndex], timestamp);
        }

        drawingContext.restore();
        drawingContext.save();
        drawingContext.shadowBlur = 14;
        drawingContext.shadowColor = dotGlowColor;

        for (var dotIndex = 0; dotIndex < dots.length; dotIndex += 1) {
            drawDot(dots[dotIndex], timestamp);
        }

        drawingContext.restore();
    }

    function drawDotTrail(dot, timestamp) {
        var opacity = clamp((timestamp - dot.createdAt) / APPEAR_DURATION_MS, 0, 1) * dot.visibility * TRAIL_ALPHA;
        if (opacity <= 0.005 || distanceBetween(dot, { x: dot.previousX, y: dot.previousY }) < 0.5) {
            return;
        }

        drawingContext.globalAlpha = opacity;
        drawingContext.strokeStyle = dot.accent ? accentDotColor : dotColor;
        drawingContext.beginPath();
        drawingContext.moveTo(dot.previousX, dot.previousY);
        drawingContext.lineTo(dot.x, dot.y);
        drawingContext.stroke();
    }

    function drawDot(dot, timestamp) {
        var opacity = clamp((timestamp - dot.createdAt) / APPEAR_DURATION_MS, 0, 1) * dot.visibility;
        if (opacity <= 0.005) {
            return;
        }

        drawingContext.globalAlpha = opacity;
        drawingContext.fillStyle = dot.accent ? accentDotColor : dotColor;
        drawingContext.fillRect(
            dot.x - DOT_SIZE_PX / 2,
            dot.y - DOT_SIZE_PX / 2,
            DOT_SIZE_PX,
            DOT_SIZE_PX);
    }

    function readAmbientColors() {
        var rootStyles = window.getComputedStyle(document.documentElement);
        dotColor = rootStyles.getPropertyValue("--ambient-dot-color").trim() || "rgba(112, 255, 196, 0.22)";
        accentDotColor = rootStyles.getPropertyValue("--ambient-dot-accent-color").trim() || "rgba(111, 162, 255, 0.16)";
        dotGlowColor = rootStyles.getPropertyValue("--ambient-dot-glow").trim() || "rgba(112, 255, 196, 0.12)";
        clearCanvas();
        drawDots(performance.now());
    }

    function observeThemeChanges() {
        if (!window.MutationObserver) {
            return;
        }

        themeObserver = new MutationObserver(readAmbientColors);
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme", "class", "style"]
        });
    }

    function clearDots() {
        dots = [];
        clearCanvas();
    }

    function clearCanvas() {
        if (drawingContext) {
            drawingContext.clearRect(0, 0, canvasWidth, canvasHeight);
        }
    }

    function pointerFromEvent(event) {
        return {
            x: clamp(event.clientX, 0, canvasWidth || window.innerWidth),
            y: clamp(event.clientY, 0, canvasHeight || window.innerHeight)
        };
    }

    function distanceBetween(firstPoint, secondPoint) {
        return magnitude(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
    }

    function magnitude(x, y) {
        return Math.sqrt(x * x + y * y);
    }

    function randomNumber(minimum, maximum) {
        return Math.random() * (maximum - minimum) + minimum;
    }

    function randomCurveStrength() {
        if (Math.random() < 0.32) {
            return randomNumber(-0.01, 0.01);
        }

        return randomNumber(-MAX_CURVE_SPEED, MAX_CURVE_SPEED);
    }

    function clamp(value, minimum, maximum) {
        return Math.min(Math.max(value, minimum), maximum);
    }
})();
