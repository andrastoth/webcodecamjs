/*!
 * WebCodeCamJS 1.9.2 javascript Bar code and QR code decoder 
 * Author: Tóth András
 * Web: http://atandrastoth.co.uk
 * email: atandrastoth@gmail.com
 * Licensed under the MIT license
 */
var WebCodeCamJS = function(element) {
    'use strict';
    this.Version = {
        name: 'WebCodeCamJS',
        version: '1.9.2',
        author: 'Tóth András'
    };
    var mediaDevices = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? navigator.mediaDevices : ((navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia) ? {
        getUserMedia: function(c) {
            return new Promise(function(y, n) {
                (navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia).call(navigator, c, y, n);
            });
        },
        enumerateDevices: function(c) {
            return new Promise(function(c, y, n) {
                (MediaStreamTrack.getSources).call(navigator, c, y, n);
            });
        }
    } : null);
    HTMLVideoElement.prototype.streamSrc = ('srcObject' in HTMLVideoElement.prototype) ? function(stream) {
        this.srcObject = !!stream ? stream : null;
    } : function(stream) {
        this.src = !!stream ? (window.URL || window.webkitURL).createObjectURL(stream) : new String();
    };
    var videoSelect, lastImageSrc, con, beepSound, w, h;
    var display = new Q(element),
        DecodeWorker = new Worker('js/DecoderWorker.js'),
        video = html('<video muted autoplay></video>'),
        sucessLocalDecode = false,
        localImage = false,
        flipped = false,
        isStreaming = false,
        delayBool = false,
        initialized = false,
        localStream = null,
        options = {
            decodeQRCodeRate: 5,
            decodeBarCodeRate: 5,
            frameRate: 15,
            width: 320,
            height: 240,
            constraints: {
                video: {
                    mandatory: {
                        maxWidth: 1280,
                        maxHeight: 720
                    },
                    optional: [{
                        sourceId: true
                    }]
                },
                audio: false
            },
            flipVertical: false,
            flipHorizontal: false,
            zoom: -1,
            beep: 'audio/beep.mp3',
            brightness: 0,
            autoBrightnessValue: false,
            grayScale: false,
            contrast: 0,
            threshold: 0,
            sharpness: [],
            resultFunction: function(resText, lastImageSrc) {
                console.log(resText);
            },
            cameraSuccess: function(stream) {
                console.log('cameraSuccess');
            },
            canPlayFunction: function() {
                console.log('canPlayFunction');
            },
            getDevicesError: function(error) {
                console.log(error);
            },
            getUserMediaError: function(error) {
                console.log(error);
            },
            cameraError: function(error) {
                console.log(error);
            }
        };

    function init() {
        var constraints = changeConstraints();
        try {
            mediaDevices.getUserMedia(constraints).then(cameraSuccess).catch(function(error) {
                options.cameraError(error);
                return false;
            });
        } catch (error) {
            options.getUserMediaError(error);
            return false;
        }
        return true;
    }

    function play() {
        if (!localImage) {
            if (!localStream) {
                init();
            }
            delayBool = true;
            video.play();
            setTimeout(function() {
                delayBool = false;
                if (options.decodeBarCodeRate) {
                    tryParseBarCode();
                }
                if (options.decodeQRCodeRate) {
                    tryParseQRCode();
                }
            }, 2E3);
        }
    }

    function stop() {
        delayBool = true;
        video.pause();
        video.streamSrc(null);
        con.clearRect(0, 0, w, h);
        try {
            localStream.stop();
            localStream.active = false;
            localStream.enabled = false;
        } catch (e) {}
        localStream = null;
    }

    function pause() {
        delayBool = true;
        video.pause();
    }

    function cameraSuccess(stream) {
        localStream = stream;
        video.streamSrc(stream);
        video.play();
        options.cameraSuccess(stream);
    }

    function cameraError(error) {
        options.cameraError(error);
    }

    function setEventListeners() {
        video.addEventListener('canplay', function(e) {
            if (!isStreaming) {
                if (video.videoWidth > 0) {
                    h = video.videoHeight / (video.videoWidth / w);
                }
                display.setAttribute('width', w);
                display.setAttribute('height', h);
                if (options.flipHorizontal) {
                    con.scale(-1, 1);
                    con.translate(-w, 0);
                }
                if (options.flipVertical) {
                    con.scale(1, -1);
                    con.translate(0, -h);
                }
                isStreaming = true;
                if (options.decodeQRCodeRate || options.decodeBarCodeRate) {
                    delay();
                }
            }
        }, false);
        video.addEventListener('play', function() {
            setInterval(function() {
                if (video.paused || video.ended) {
                    return;
                }
                var z = options.zoom;
                if (z < 0) {
                    z = optimalZoom();
                }
                con.drawImage(video, (w * z - w) / -2, (h * z - h) / -2, w * z, h * z);
                var imageData = con.getImageData(0, 0, w, h);
                if (options.grayScale) {
                    imageData = grayScale(imageData);
                }
                if (options.brightness !== 0 || options.autoBrightnessValue) {
                    imageData = brightness(imageData, options.brightness);
                }
                if (options.contrast !== 0) {
                    imageData = contrast(imageData, options.contrast);
                }
                if (options.threshold !== 0) {
                    imageData = threshold(imageData, options.threshold);
                }
                if (options.sharpness.length !== 0) {
                    imageData = convolute(imageData, options.sharpness);
                }
                con.putImageData(imageData, 0, 0);
            }, 1E3 / options.frameRate);
        }, false);
    }

    function setCallBack() {
        DecodeWorker.onmessage = function(e) {
            if (localImage || (!delayBool && !video.paused)) {
                if (e.data.success && e.data.result[0].length > 1 && e.data.result[0].indexOf('undefined') == -1) {
                    sucessLocalDecode = true;
                    beepSound.play();
                    delayBool = true;
                    delay();
                    setTimeout(function() {
                        options.resultFunction(e.data.result[0], lastImageSrc);
                    }, 0);
                } else if (e.data.finished && options.decodeBarCodeRate) {
                    flipped = !flipped;
                    if (!sucessLocalDecode || !localImage) {
                        setTimeout(tryParseBarCode, 1E3 / options.decodeBarCodeRate);
                    }
                }
            }
        };
        qrcode.callback = function(a) {
            if (localImage || (!delayBool && !video.paused)) {
                beepSound.play();
                delayBool = true;
                delay();
                sucessLocalDecode = true;
                setTimeout(function() {
                    options.resultFunction(a, lastImageSrc);
                }, 0);
            }
        };
    }

    function tryParseBarCode() {
        var flipMode = flipped === true ? 'flip' : 'normal';
        lastImageSrc = display.toDataURL();
        DecodeWorker.postMessage({
            ImageData: con.getImageData(0, 0, w, h).data,
            Width: w,
            Height: h,
            cmd: flipMode,
            DecodeNr: 1,
            LowLight: false
        });
    }

    function tryParseQRCode() {
        try {
            lastImageSrc = display.toDataURL();
            qrcode.decode();
        } catch (e) {
            if (!localImage && !delayBool) {
                setTimeout(tryParseQRCode, 1E3 / options.decodeQRCodeRate);
            }
        }
    }

    function delay() {
        if (!localImage) {
            setTimeout(play, 500, true);
        }
    }

    function optimalZoom() {
        return video.videoHeight / h;
    }

    function getImageLightness() {
        var pixels = con.getImageData(0, 0, w, h),
            d = pixels.data,
            colorSum = 0,
            r, g, b, avg;
        for (var x = 0, len = d.length; x < len; x += 4) {
            r = d[x];
            g = d[x + 1];
            b = d[x + 2];
            avg = Math.floor((r + g + b) / 3);
            colorSum += avg;
        }
        return Math.floor(colorSum / (w * h));
    }

    function brightness(pixels, adjustment) {
        adjustment = adjustment === 0 && options.autoBrightnessValue ? Number(options.autoBrightnessValue) - getImageLightness() : adjustment;
        var d = pixels.data;
        for (var i = 0; i < d.length; i += 4) {
            d[i] += adjustment;
            d[i + 1] += adjustment;
            d[i + 2] += adjustment;
        }
        return pixels;
    }

    function grayScale(pixels) {
        var d = pixels.data;
        for (var i = 0; i < d.length; i += 4) {
            var r = d[i],
                g = d[i + 1],
                b = d[i + 2],
                v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        return pixels;
    }

    function contrast(pixels, cont) {
        var d = pixels.data,
            average;
        for (var i = 0; i < d.length; i += 4) {
            cont = 10,
                average = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3);
            if (average > 127) {
                d[i] += d[i] / average * cont;
                d[i + 1] += d[i + 1] / average * cont;
                d[i + 2] += d[i + 2] / average * cont;
            } else {
                d[i] -= d[i] / average * cont;
                d[i + 1] -= d[i + 1] / average * cont;
                d[i + 2] -= d[i + 2] / average * cont;
            }
        }
        return pixels;
    }

    function threshold(pixels, thres) {
        var average, d = pixels.data;
        for (var i = 0, len = w * h * 4; i < len; i += 4) {
            average = d[i] + d[i + 1] + d[i + 2];
            if (average < thres) {
                d[i] = d[i + 1] = d[i + 2] = 0;
            } else {
                d[i] = d[i + 1] = d[i + 2] = 255;
            }
            d[i + 3] = 255;
        }
        return pixels;
    }

    function convolute(pixels, weights, opaque) {
        var sw = pixels.width,
            sh = pixels.height,
            w = sw,
            h = sh,
            side = Math.round(Math.sqrt(weights.length)),
            halfSide = Math.floor(side / 2),
            src = pixels.data,
            tmpCanvas = document.createElement('canvas'),
            tmpCtx = tmpCanvas.getContext('2d'),
            output = tmpCtx.createImageData(w, h),
            dst = output.data,
            alphaFac = opaque ? 1 : 0;
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var sy = y,
                    sx = x,
                    r = 0,
                    g = 0,
                    b = 0,
                    a = 0,
                    dstOff = (y * w + x) * 4;
                for (var cy = 0; cy < side; cy++) {
                    for (var cx = 0; cx < side; cx++) {
                        var scy = sy + cy - halfSide,
                            scx = sx + cx - halfSide;
                        if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
                            var srcOff = (scy * sw + scx) * 4,
                                wt = weights[cy * side + cx];
                            r += src[srcOff] * wt;
                            g += src[srcOff + 1] * wt;
                            b += src[srcOff + 2] * wt;
                            a += src[srcOff + 3] * wt;
                        }
                    }
                }
                dst[dstOff] = r;
                dst[dstOff + 1] = g;
                dst[dstOff + 2] = b;
                dst[dstOff + 3] = a + alphaFac * (255 - a);
            }
        }
        return output;
    }

    function buildSelectMenu(selectorVideo, ind) {
        videoSelect = new Q(selectorVideo);
        videoSelect.innerHTML = '';
        try {
            if (mediaDevices && mediaDevices.enumerateDevices) {
                mediaDevices.enumerateDevices().then(function(devices) {
                    devices.forEach(function(device) {
                        gotSources(device);
                    });
                    videoSelect.selectedIndex = videoSelect.children.length <= ind ? 0 : ind;
                }).catch(function(error) {
                    options.getDevicesError(error);
                });
            } else if (mediaDevices && !mediaDevices.enumerateDevices) {
                html('<option value="true">On</option>', videoSelect);
                options.getDevicesError(new NotSupportError('enumerateDevices Or getSources is Not supported'));
            } else {
                throw new NotSupportError('getUserMedia is Not supported');
            }
        } catch (error) {
            options.getDevicesError(error);
        }
    }

    function gotSources(device) {
        if (device.kind === 'video' || device.kind === 'videoinput') {
            var face = (!device.facing || device.facing === '') ? 'unknown' : device.facing;
            var text = device.label || 'camera ' + (videoSelect.length + 1) + ' (facing: ' + face + ')';
            html('<option value="' + (device.id || device.deviceId) + '">' + text + '</option>', videoSelect);
        }
    }

    function changeConstraints() {
        var constraints = JSON.parse(JSON.stringify(options.constraints));
        if (videoSelect && videoSelect.length !== 0) {
            switch (videoSelect[videoSelect.selectedIndex].value.toString()) {
                case 'true':
                    constraints.video.optional = [{
                        sourceId: true
                    }];
                    break;
                case 'false':
                    constraints.video = false;
                    break;
                default:
                    constraints.video.optional = [{
                        sourceId: videoSelect[videoSelect.selectedIndex].value
                    }];
                    break;
            }
        }
        constraints.audio = false;
        return constraints;
    }

    function Q(el) {
        if (typeof el === 'string') {
            var els = document.querySelectorAll(el);
            return typeof els === 'undefined' ? undefined : els.length > 1 ? els : els[0];
        }
        return el;
    }

    function decodeLocalImage(url) {
        stop();
        localImage = true;
        sucessLocalDecode = false;
        var img = new Image();
        img.onload = function() {
            con.fillStyle = '#fff';
            con.fillRect(0, 0, w, h);
            con.drawImage(this, 5, 5, w - 10, h - 10);
            tryParseQRCode();
            tryParseBarCode();
        };
        if (url) {
            download("temp", url);
            decodeLocalImage();
        } else {
            if (FileReaderHelper) {
                new FileReaderHelper().Init('jpg|png|jpeg|gif', 'dataURL', function(e) {
                    img.src = e.data;
                }, true);
            } else {
                alert("fileReader class not found!");
            }
        }
    }

    function download(filename, url) {
        var a = window.document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }

    function mergeRecursive(target, source) {
        if (typeof target !== 'object') {
            target = {};
        }
        for (var property in source) {
            if (source.hasOwnProperty(property)) {
                var sourceProperty = source[property];
                if (typeof sourceProperty === 'object') {
                    target[property] = mergeRecursive(target[property], sourceProperty);
                    continue;
                }
                target[property] = sourceProperty;
            }
        }
        for (var a = 2, l = arguments.length; a < l; a++) {
            mergeRecursive(target, arguments[a]);
        }
        return target;
    }

    function html(innerhtml, appendTo) {
        var item = document.createElement('div');
        if (innerhtml) {
            item.innerHTML = innerhtml;
        }
        if (appendTo) {
            appendTo.appendChild(item.children[0]);
            return item;
        }
        return item.children[0];
    }

    function NotSupportError(message) {
        this.name = 'NotSupportError';
        this.message = (message || '');
    }
    NotSupportError.prototype = Error.prototype;
    return {
        init: function(opt) {
            if (initialized) {
                return this;
            }
            if (!display || display.tagName.toLowerCase() !== 'canvas') {
                console.log('Element type must be canvas!');
                alert('Element type must be canvas!');
                return false;
            }
            con = display.getContext('2d');
            if (opt) {
                options = mergeRecursive(options, opt);
                beepSound = new Audio(options.beep);
            }
            display.width = w = options.width;
            display.height = h = options.height;
            qrcode.sourceCanvas = display;
            initialized = true;
            setEventListeners();
            if (options.decodeQRCodeRate || options.decodeBarCodeRate) {
                setCallBack();
            }
            return this;
        },
        play: function() {
            localImage = false;
            play();
            return this;
        },
        stop: function() {
            stop();
            return this;
        },
        pause: function() {
            pause();
            return this;
        },
        buildSelectMenu: function(selector, ind) {
            buildSelectMenu(selector, ind ? ind : 0);
            return this;
        },
        getOptimalZoom: function() {
            return optimalZoom();
        },
        getLastImageSrc: function() {
            return display.toDataURL();
        },
        decodeLocalImage: function(url) {
            decodeLocalImage(url);
        },
        isInitialized: function() {
            return initialized;
        },
        options: options
    };
};