/*!
<<<<<<< HEAD
 * WebCodeCamJQuery 2.5.0 jQuery plugin Bar code and QR code decoder
=======
 * WebCodeCamJQuery 2.7.0 jQuery plugin Bar code and QR code decoder
>>>>>>> refs/remotes/origin/master
 * Author: Tóth András
 * Web: http://atandrastoth.co.uk
 * email: atandrastoth@gmail.com
 * Licensed under the MIT license
 */
(function($, window, document, undefined) {
    'use strict';
    var pluginName = 'WebCodeCamJQuery';
    var mediaDevices = window.navigator.mediaDevices;
    mediaDevices.getUserMedia = function(c) {
        return new Promise(function(y, n) {
            (window.navigator.getUserMedia || window.navigator.mozGetUserMedia || window.navigator.webkitGetUserMedia).call(navigator, c, y, n);
        });
    }
    HTMLVideoElement.prototype.streamSrc = ('srcObject' in HTMLVideoElement.prototype) ? function(stream) {
        this.srcObject = !!stream ? stream : null;
    } : function(stream) {
        if (!!stream) {
            this.src = (window.URL || window.webkitURL).createObjectURL(stream);
        } else {
            this.removeAttribute('src');
        }
    };
    var Self, display, videoSelect, lastImageSrc, con, beepSound, w, h, lastCode,
        DecodeWorker = null,
        video = $('<video muted autoplay></video>')[0],
        sucessLocalDecode = false,
        localImage = false,
        flipMode = [1, 3, 6, 8],
        isStreaming = false,
        delayBool = false,
        initialized = false,
        localStream = null,
        defaults = {
            decodeQRCodeRate: 5,
            decodeBarCodeRate: 3,
            successTimeout: 500,
            codeRepetition: true,
            tryVertical: true,
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
            zoom: 0,
            beep: 'audio/beep.mp3',
            decoderWorker: 'js/DecoderWorker.js',
            brightness: 0,
            autoBrightnessValue: 0,
            grayScale: 0,
            contrast: 0,
            threshold: 0,
            sharpness: [],
            resultFunction: function(res) {
                console.log(res.format + ": " + res.code);
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

    function Plugin(element, options) {
        Self = this;
        this.element = element;
        display = element;
        this.options = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;
        return this;
    }

    function init() {
        var constraints = changeConstraints();
        try {
            mediaDevices.getUserMedia(constraints).then(cameraSuccess).catch(function(error) {
                Self.options.cameraError(error);
                return false;
            });
        } catch (error) {
            Self.options.getUserMediaError(error);
            return false;
        }
        return true;
    }

    function play() {
        if (!localImage) {
            if (!localStream) {
                init();
            }
            const p = video.play();
            if (p && (typeof Promise !== 'undefined') && (p instanceof Promise)) {
                p.catch(e => null);
            }
            delay();
        }
    }

    function stop() {
        delayBool = true;
        const p = video.pause();
        if (p && (typeof Promise !== 'undefined') && (p instanceof Promise)) {
            p.catch(e => null);
        }
        video.streamSrc(null);
        con.clearRect(0, 0, w, h);
        if (localStream) {
            for (var i = 0; i < localStream.getTracks().length; i++) {
                localStream.getTracks()[i].stop();
            }
        }
        localStream = null;
    }

    function pause() {
        delayBool = true;
        const p = video.pause();
        if (p && (typeof Promise !== 'undefined') && (p instanceof Promise)) {
            p.catch(e => null);
        }
    }

    function delay() {
        delayBool = true;
        if (!localImage) {
            setTimeout(function() {
                delayBool = false;
                if (Self.options.decodeBarCodeRate) {
                    tryParseBarCode();
                }
                if (Self.options.decodeQRCodeRate) {
                    tryParseQRCode();
                }
            }, Self.options.successTimeout);
        }
    }

    function beep() {
        if (Self.options.beep) {
            beepSound.play();
        }
    }

    function cameraSuccess(stream) {
        localStream = stream;
        video.streamSrc(stream);
        Self.options.cameraSuccess(stream);
    }

    function cameraError(error) {
        Self.options.cameraError(error);
    }

    function setEventListeners() {
        $(video).on('canplay', function(e) {
            if (!isStreaming) {
                if (video.videoWidth > 0) {
                    h = video.videoHeight / (video.videoWidth / w);
                }
                $(display).attr('width', w);
                $(display).attr('height', h);
                isStreaming = true;
                if (Self.options.decodeQRCodeRate || Self.options.decodeBarCodeRate) {
                    delay();
                }
            }
        });
        $(video).on('play', function() {
            setInterval(function() {
                if (!video.paused && !video.ended) {
                    var z = Self.options.zoom;
                    if (z === 0) {
                        z = optimalZoom();
                    }
                    con.drawImage(video, (w * z - w) / -2, (h * z - h) / -2, w * z, h * z);
                    var imageData = con.getImageData(0, 0, w, h);
                    if (Self.options.grayScale) {
                        imageData = grayScale(imageData);
                    }
                    if (Self.options.brightness !== 0 || Self.options.autoBrightnessValue) {
                        imageData = brightness(imageData, Self.options.brightness);
                    }
                    if (Self.options.contrast !== 0) {
                        imageData = contrast(imageData, Self.options.contrast);
                    }
                    if (Self.options.threshold !== 0) {
                        imageData = threshold(imageData, Self.options.threshold);
                    }
                    if (Self.options.sharpness.length !== 0) {
                        imageData = convolute(imageData, Self.options.sharpness);
                    }
                    con.putImageData(imageData, 0, 0);
                }
            }, 1E3 / Self.options.frameRate);
        });
    }

    function setCallBack() {
        DecodeWorker.onmessage = function(e) {
            if (localImage || (!delayBool && !video.paused)) {
                if (e.data.success === true && e.data.success != 'localization') {
                    sucessLocalDecode = true;
                    delayBool = true;
                    delay();
                    setTimeout(function() {
                        if (Self.options.codeRepetition || lastCode != e.data.result[0].Value) {
                            beep();
                            lastCode = e.data.result[0].Value;
                            Self.options.resultFunction({
                                format: e.data.result[0].Format,
                                code: e.data.result[0].Value,
                                imgData: lastImageSrc
                            });
                        }
                    }, 0);
                }
                if ((!sucessLocalDecode || !localImage) && e.data.success != 'localization') {
                    if (!localImage) {
                        setTimeout(tryParseBarCode, 1E3 / Self.options.decodeBarCodeRate);
                    }
                }
            }
        };
        qrcode.callback = function(a) {
            if (localImage || (!delayBool && !video.paused)) {
                sucessLocalDecode = true;
                delayBool = true;
                delay();
                setTimeout(function() {
                    if (Self.options.codeRepetition || lastCode != a) {
                        beep();
                        lastCode = a;
                        Self.options.resultFunction({
                            format: 'QR Code',
                            code: a,
                            imgData: lastImageSrc
                        });
                    }
                }, 0);
            }
        };
    }

    function tryParseBarCode() {
        $(display).css({
            'transform': 'scale(' + (Self.options.flipHorizontal ? '-1' : '1') + ', ' + (Self.options.flipVertical ? '-1' : '1') + ')'
        });
        if (Self.options.tryVertical && !localImage) {
            flipMode.push(flipMode[0]);
            flipMode.splice(0, 1);
        } else {
            flipMode = [1, 3, 6, 8];
        }
        lastImageSrc = display.toDataURL();
        DecodeWorker.postMessage({
            scan: con.getImageData(0, 0, w, h).data,
            scanWidth: w,
            scanHeight: h,
            multiple: false,
            decodeFormats: ["Code128", "Code93", "Code39", "EAN-13", "2Of5", "Inter2Of5", "Codabar"],
            rotation: flipMode[0]
        });
    }

    function tryParseQRCode() {
        $(display).css({
            'transform': 'scale(' + (Self.options.flipHorizontal ? '-1' : '1') + ', ' + (Self.options.flipVertical ? '-1' : '1') + ')'
        });
        try {
            lastImageSrc = display.toDataURL();
            qrcode.decode();
        } catch (e) {
            if (!localImage && !delayBool) {
                setTimeout(tryParseQRCode, 1E3 / Self.options.decodeQRCodeRate);
            }
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
        adjustment = adjustment === 0 && Self.options.autoBrightnessValue ? Self.options.autoBrightnessValue - getImageLightness() : adjustment;
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
        var data = pixels.data;
        var factor = (259 * (cont + 255)) / (255 * (259 - cont));
        for (var i = 0; i < data.length; i += 4) {
            data[i] = factor * (data[i] - 128) + 128;
            data[i + 1] = factor * (data[i + 1] - 128) + 128;
            data[i + 2] = factor * (data[i + 2] - 128) + 128;
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
        videoSelect = $(selectorVideo);
        videoSelect.html('');
        try {
            if (mediaDevices && mediaDevices.enumerateDevices) {
                mediaDevices.enumerateDevices().then(function(devices) {
                    devices.forEach(function(device) {
                        gotSources(device);
                    });
                    if (typeof ind === 'string') {
                        Array.prototype.find.call(videoSelect.get(0).children, function(a, i) {
                            if ($(a).text().toLowerCase().match(new RegExp(ind, 'g'))) {
                                videoSelect.prop('selectedIndex', i);
                            }
                        });
                    } else {
                        videoSelect.prop('selectedIndex', videoSelect.children().length <= ind ? 0 : ind);
                    }
                }).catch(function(error) {
                    Self.options.getDevicesError(error);
                });
            } else if (mediaDevices && !mediaDevices.enumerateDevices) {
                $('<option value="true">On</option>').appendTo(videoSelect);
                Self.options.getDevicesError(new NotSupportError('enumerateDevices Or getSources is Not supported'));
            } else {
                throw new NotSupportError('getUserMedia is Not supported');
            }
        } catch (error) {
            Self.options.getDevicesError(error);
        }
    }

    function gotSources(device) {
        if (device.kind === 'video' || device.kind === 'videoinput') {
            var face = (!device.facing || device.facing === '') ? 'unknown' : device.facing;
            var text = device.label || 'Camera '.concat(videoSelect.children().length + 1, ' (facing: ' + face + ')');
            $('<option value="' + (device.id || device.deviceId) + '">' + text + '</option>').appendTo(videoSelect);
        }
    }

    function changeConstraints() {
        var constraints = $.parseJSON(JSON.stringify(Self.options.constraints));
        if (videoSelect && videoSelect.children().length !== 0) {
            switch (videoSelect.val().toString()) {
                case 'true':
                    if (navigator.userAgent.search("Edge") == -1 && navigator.userAgent.search("Chrome") != -1) {
                        constraints.video.optional = [{
                            sourceId: true
                        }];
                    } else {
                        constraints.video.deviceId = undefined;  
                    }
                    break;
                case 'false':
                    constraints.video = false;
                    break;
                default:
                    if (navigator.userAgent.search("Edge") == -1 && navigator.userAgent.search("Chrome") != -1) {
                        constraints.video.optional = [{
                            sourceId: videoSelect.val()
                        }];
                    } else if (navigator.userAgent.search("Firefox") != -1) {
                        constraints.video.deviceId = {
                            exact: videoSelect.val()
                        };
                    } else {
                         constraints.video.deviceId = videoSelect.val();
                    }
                    break;
            }
        }
        constraints.audio = false;
        return constraints;
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
        var a = $('<a>');
        a.attr('href', url);
        a.attr('download', filename);
        a.css('display', 'none');
        a.appendTo('body');
        a.click();
        a.remove();
    }

    function NotSupportError(message) {
        this.name = 'NotSupportError';
        this.message = (message || '');
    }
    NotSupportError.prototype = Error.prototype;
    $.extend(Plugin.prototype, {
        init: function() {
            if (!initialized) {
                if (!display || display.tagName.toLowerCase() !== 'canvas') {
                    console.log('Element type must be canvas!');
                    alert('Element type must be canvas!');
                    return false;
                }
                con = display.getContext('2d');
                display.width = w = Self.options.width;
                display.height = h = Self.options.height;
                qrcode.sourceCanvas = display;
                initialized = true;
                setEventListeners();
                DecodeWorker = new Worker(this.options.decoderWorker);
                if (this.options.beep) {
                    beepSound = new Audio(this.options.beep);
                }
                if (this.options.decodeQRCodeRate || this.options.decodeBarCodeRate) {
                    setCallBack();
                }
            }
            return this;
        },
        play: function() {
            this.init();
            localImage = false;
            setTimeout(play, 100);
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
        }
    });
    $.fn[pluginName] = function(options) {
        return this.each(function() {
            if (!$.data(this, 'plugin_' + pluginName)) {
                $.data(this, 'plugin_' + pluginName, new Plugin(this, options));
            }
        });
    };
})(jQuery, window, document);
