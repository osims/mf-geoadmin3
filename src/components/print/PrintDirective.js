(function() {
  goog.provide('ga_print_directive');

  var module = angular.module('ga_print_directive',
    ['pascalprecht.translate']);

  module.controller('GaPrintDirectiveController',
    function($scope, $http, $window, $translate, gaLayers, gaPermalink) {

    var topicId;

    var updatePrintConfig = function() {
      var printPath = $scope.options.printPath;
      var http = $http.get(printPath +
          '/info.json?url=' + encodeURIComponent(printPath) +
          '&app=' + topicId);

      http.success(function(data) {
        $scope.capabilities = data;

        // default values:
        $scope.layout = data.layouts[0];
        $scope.dpi = data.dpis[0];
        $scope.scales = data.scales;
        $scope.options.legend = false;
        $scope.options.graticule = false;
      });
    };

    $scope.$on('gaTopicChange', function(event, topic) {
      topicId = topic.id;
      updatePrintConfig();
    });

    var encodeLayer = function(layer, proj) {

      var encLayer, encLegend;
      var ext = proj.getExtent();
      var resolution = $scope.map.getView().getResolution();

      if (!(layer instanceof ol.layer.Group)) {
        var src = layer.getSource();
        var layerConfig = gaLayers.getLayer(layer.bodId) || {};
        var minResolution = layerConfig.minResolution || 0;
        var maxResolution = layerConfig.maxResolution || Infinity;

        if (resolution <= maxResolution &&
              resolution >= minResolution) {
          if (src instanceof ol.source.WMTS) {
             encLayer = $scope.encoders.layers['WMTS'].call(this,
                 layer, layerConfig);
          } else if (src instanceof ol.source.ImageWMS ||
              src instanceof ol.source.TileWMS) {
             encLayer = $scope.encoders.layers['WMS'].call(this,
                 layer, layerConfig);
          } else if (layer instanceof ol.layer.Vector) {
             var features = [];
             src.forEachFeatureInExtent(ext, function(feat) {
               features.push(feat);
             });

             if (features && features.length > 0) {
               encLayer =
                   $scope.encoders.layers['Vector'].call(this,
                      layer, features);
             }
          }
        }
      }

      if ($scope.options.legend && layerConfig.hasLegend) {
        encLegend = $scope.encoders.legends['ga_urllegend'].call(this,
                          layer, layerConfig);
      }

      return {layer: encLayer, legend: encLegend};

    };

    // Transform an ol.Color to an hexadecimal string
    var toHexa = function(olColor) {
      var hex = '#';
      for (var i = 0; i < 3; i++) {
        var part = olColor[i].toString(16);
        if (part.length === 1 && parseInt(part) < 10) {
          hex += '0';
        }
        hex += part;
      }
      return hex;
    };

    // Transform a ol.style.Style to a print literal object
    var transformToPrintLiteral = function(feature, style) {
      /**
       * ol.style.Style properties:
       *
       *  fill: ol.style.Fill :
       *    fill: String
       *  image: ol.style.Image:
       *    anchor: array[2]
       *    rotation
       *    size: array[2]
       *    src: String
       *  stroke: ol.style.Stroke:
       *    color: String
       *    lineCap
       *    lineDash
       *    lineJoin
       *    miterLimit
       *    width: Number
       *  text
       *  zIndex
       */

      /**
       * Print server properties:
       *
       * fillColor
       * fillOpacity
       * strokeColor
       * strokeOpacity
       * strokeWidth
       * strokeLinecap
       * strokeDashstyle
       * pointRadius
       * label
       * fontFamily
       * fontSize
       * fontWeight
       * fontColor
       * labelAlign
       * labelOutlineColor
       * labelOutlineWidth
       * graphicHeight
       * graphicOpacity
       * graphicWidth
       * graphicXOffset
       * graphicYOffset
       * zIndex
       */
      var literal = {
        zIndex: style.getZIndex()
      };
      var type = feature.getGeometry().getType();
      var fill = style.getFill();
      var stroke = style.getStroke();
      var textStyle = style.getText();
      var imageStyle = style.getImage();

      if (imageStyle) {
        var size = imageStyle.getSize();
        var anchor = imageStyle.getAnchor();
        var scale = imageStyle.getScale();
        literal.rotation = imageStyle.getRotation();
        if (size) {
          literal.graphicWidth = size[0] * scale;
          literal.graphicHeight = size[1] * scale;
        }
        if (anchor) {
          literal.graphicXOffset = -anchor[0] * scale;
          literal.graphicYOffset = -anchor[1] * scale;
        }
        if (imageStyle instanceof ol.style.Icon) {
          literal.externalGraphic = imageStyle.getSrc();
        } else { // ol.style.Circle
          fill = imageStyle.getFill();
          stroke = imageStyle.getStroke();
          literal.pointRadius = imageStyle.getRadius();
        }
      }

      if (fill) {
        var color = ol.color.asArray(fill.getColor());
        literal.fillColor = toHexa(color);
        literal.fillOpacity = color[3];
      }

      if (stroke) {
        var color = ol.color.asArray(stroke.getColor());
        literal.strokeWidth = stroke.getWidth();
        literal.strokeColor = toHexa(color);
        literal.strokeOpacity = color[3];
        literal.strokeLinecap = stroke.getLineCap() || 'round';

        if (stroke.getLineDash()) {
          literal.strokeDashstyle = stroke.getLineDash();
        }
        // TO FIX: Not managed by the print server
        // literal.strokeLinejoin = stroke.getLineJoin();
        // literal.strokeMiterlimit = stroke.getMiterLimit();
      }

      // TO FIX: Not managed by OL3
      /*if (textStyle) {
        literal.fontColor = textStyle.getFill().getColor();
        literal.fontFamily = textStyle.getFont();
        literal.fontSize =
        literal.fontWeight =
        literal.label = textStyle.getText();
        literal.labelAlign = textStyle.getTextAlign();
        literal.labelOutlineColor = textStyle.getStroke().getColor();
        literal.labelOutlineWidth = textStyle.getStroke().getWidth();
      }*/

      return literal;
    };

    $scope.encoders = {
      'layers': {
        'Layer': function(layer) {
          var enc = {
            layer: layer.bodId,
            opacity: layer.getOpacity()
          };

          return enc;
        },
        'Group': function(layer, proj) {
          var encs = [];
          var subLayers = layer.getLayers();
          subLayers.forEach(function(subLayer, idx, arr) {
            if (subLayer.visible) {
              var enc = $scope.encoders.
                  layers['Layer'].call(this, layer);
              var layerEnc = encodeLayer(subLayer, proj);
              if (layerEnc.layer !== undefined) {
                $.extend(enc, layerEnc);
                encs.push(enc.layer);
              }
            }
          });
          return encs;
        },
        'Vector': function(layer, features) {
          var enc = $scope.encoders.
              layers['Layer'].call(this, layer);
          var format = new ol.format.GeoJSON();
          var encStyles = {};
          var encFeatures = [];
          var stylesDict = {};
          var styleId = 0;

          angular.forEach(features, function(feature) {
            var encStyle = {
              id: styleId
            };
            var geometry = feature.getGeometry();
            var encJSON = format.writeFeature(feature);
            encJSON.properties._gx_style = styleId;
            encFeatures.push(encJSON);
            var styles = (layer.getStyleFunction()) ?
                layer.getStyleFunction()(feature) :
                ol.feature.defaultStyleFunction(feature);

            if (styles && styles.length > 0) {
              $.extend(encStyle, transformToPrintLiteral(feature, styles[0]));
            }

            encStyles[styleId] = encStyle;
            styleId++;
          });
          angular.extend(enc, {
            type: 'Vector',
            styles: encStyles,
            styleProperty: '_gx_style',
            geoJson: {
              type: 'FeatureCollection',
              features: encFeatures
            },
            name: layer.bodId,
            opacity: (layer.opacity != null) ? layer.opacity : 1.0
          });
          return enc;
        },
        'WMS': function(layer, config) {
            var enc = $scope.encoders.
              layers['Layer'].call(this, layer);
            var params = layer.getSource().getParams();
            var layers = params.LAYERS.split(',') || [];
            var styles = new Array(layers.length + 1).
                join(',').split(',');
            angular.extend(enc, {
              type: 'WMS',
              baseURL: config.wmsUrl || layer.url,
              layers: layers,
              styles: styles,
              format: 'image/' + (config.format || 'png'),
              customParams: {
                'EXCEPTIONS': 'XML',
                'TRANSPARENT': 'true',
                'CRS': 'EPSG:21781',
                'TIME': params.TIME
              },
              singleTile: config.singleTile || false
            });
            return enc;

        },
        'WMTS': function(layer, config) {
            var enc = $scope.encoders.layers['Layer'].
                call(this, layer);
            angular.extend(enc, {
              type: 'WMTS',
              baseURL: location.protocol + '//wmts.geo.admin.ch',
              layer: config.serverLayerName,
              maxExtent: [420000, 30000, 900000, 350000],
              tileOrigin: [420000, 350000],
              tileSize: [256, 256],
              style: 'default',
              resolutions: [4000,
                    3750,
                    3500,
                    3250,
                    3000,
                    2750,
                    2500,
                    2250,
                    2000,
                    1750,
                    1500,
                    1250,
                    1000,
                     750,
                     650,
                     500,
                     250,
                     100,
                      50,
                      20,
                      10,
                       5,
                     2.5,
                       2,
                     1.5,
                       1,
                     0.5],
              zoomOffset: 0,
              version: '1.0.0',
              requestEncoding: 'REST',
              formatSuffix: config.format || 'jpeg',
              style: 'default',
              dimensions: ['TIME'],
              params: {'TIME':
                  layer.getSource().getDimensions().Time},
              matrixSet: '21781'
          });

          return enc;
        }
      },
      'legends' : {
        'ga_urllegend': function(layer, config) {
          var enc = $scope.encoders.legends.base.call(this, config);
          enc.classes.push({
            name: '',
            icon: location.protocol + $scope.options.serviceUrl +
                $scope.options.baseUrlPath +
                '/wsgi/static/images/legends/' +
                layer.bodId + '_' + $translate.uses() +
                '.png'
          });
          return enc;
        },
        'base': function(config) {
          return {
            name: config.label,
            classes: []
          };
        }
      }
    };

    var getNearestScale = function(target, scales) {

      var nearest = null;

      angular.forEach(scales, function(scale) {
        if (nearest == null ||
            Math.abs(scale - target) < Math.abs(nearest - target)) {
              nearest = scale;
        }
      });
      return nearest;
    };

    $scope.downloadUrl = function(url) {
      $window.location.href = url;
    };

    $scope.submit = function() {
      // http://mapfish.org/doc/print/protocol.html#print-pdf
      var view = $scope.map.getView();
      var proj = view.getProjection();
      var lang = $translate.uses();
      var configLang = 'lang' + lang;
      var defaultPage = {};
      defaultPage[configLang] = true;
      var encodedPermalinkHref =
          encodeURIComponent(gaPermalink.getHref());

      var qrcodeurl = location.protocol + $scope.options.serviceUrl +
          '/qrcodegenerator?url=' + encodedPermalinkHref;
      var shortenUrl = location.protocol + $scope.options.serviceUrl +
          '/shorten.json?cb=JSON_CALLBACK';

      var encLayers = [];
      var encLegends;
      var attributions = [];

      var layers = this.map.getLayers();
      angular.forEach(layers, function(layer) {
        if (layer.visible) {
          var attribution =
            gaLayers.getLayerProperty(layer.bodId,'attribution');
          if (attributions.indexOf(attribution) == -1) {
            attributions.push(attribution);
          }
          if (layer instanceof ol.layer.Group) {
            var encs = $scope.encoders.layers['Group'].call(this,
                layer, proj);
            $.extend(encLayers, encs);
          } else {
            var enc = encodeLayer(layer, proj);
            if (enc) {
              encLayers.push(enc.layer);
              if (enc.legend) {
                encLegends = encLegends || [];
                encLegends.push(enc.legend);
              }
            }
          }
        }
      });
      if ($scope.options.graticule) {
        var graticule = {
          'baseURL': 'http://wms.geo.admin.ch/',
          'opacity': 1,
          'singleTile': true,
          'type': 'WMS',
          'layers': ['org.epsg.grid_21781'],
          'format': 'image/png',
          'styles': [''],
          'customParams': {
            'TRANSPARENT': true
          }
        };
        encLayers.push(graticule);
      }
      // scale = resolution * inches per map unit (m) * dpi
      var scale = parseInt(view.getResolution() * 39.37 * 254);
      var scales = this.scales.map(function(scale) {
        return parseInt(scale.value);
      });
      var that = this;
      $http.jsonp(shortenUrl, {
        params: {
          url: gaPermalink.getHref()
        }
      }).success(function(response) {
        var spec = {
          layout: that.layout.name,
          srs: proj.getCode(),
          units: proj.getUnits() || 'm',
          rotation: view.getRotation(),
          app: topicId, //topic name
          lang: $translate.uses(),
          dpi: that.dpi.value,
          layers: encLayers,
          legends: encLegends,
          enableLegends: (encLegends && encLegends.length > 0),
          qrcodeurl: qrcodeurl,
          pages: [
          angular.extend({
            center: view.getCenter(),
            // scale has to be one of the advertise by the print server
            scale: getNearestScale(scale, scales),
            dataOwner: '© ' + attributions.join(),
            shortLink: response.shorturl.replace('/shorten','')
          }, defaultPage)]
        };
        var http = $http.post(that.capabilities.createURL +
            '?url=' + encodeURIComponent($scope.options.printPath +
            '/create.json'), spec);
        http.success(function(data) {
          $scope.downloadUrl(data.getURL);
        });
      });
    };
  });

  module.directive('gaPrint',
    function($http, $log, $translate) {
      return {
        restrict: 'A',
        templateUrl: 'components/print/partials/print.html',
        controller: 'GaPrintDirectiveController',
        link: function(scope, elt, attrs, controller) {
        }
      };
    }
  );
})();
