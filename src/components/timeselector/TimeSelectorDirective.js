(function() {
  goog.provide('ga_timeselector_directive');

  goog.require('ga_debounce_service');
  goog.require('ga_map_service');
  goog.require('ga_permalink_service');
  goog.require('ga_slider_directive');

  var module = angular.module('ga_timeselector_directive', [
    'ga_debounce_service',
    'ga_map_service',
    'ga_permalink_service',
    'ga_slider_directive',
    'pascalprecht.translate'
  ]);

  module.controller('GaTimeSelectorDirectiveController',
    function($scope, $translate, $sce, gaLayers, gaPermalink,
        gaBrowserSniffer) {

      // Initialize variables
      $scope.stateClass = $scope.isActive ? '' : 'inactive';
      $scope.minYear = 1844;
      $scope.maxYear = (new Date()).getFullYear();
      $scope.currentYear = -1; // User selected year
      $scope.years = []; //List of all possible years 1845 -> current year
      $scope.availableYears = []; // List of available years

      // Format the text of the current year (only used by slider)
      $scope.formatYear = function(value) {
        return $sce.trustAsHtml('' + value);
      };

      // Fill the years array. This array will be used to configure the
      // display of the slider (minor and major divisions ...)
      for (var i = $scope.maxYear; i >= $scope.minYear; i--) {
        var year = {
          label: (gaBrowserSniffer.mobile) ? i : $scope.formatYear(i),
          value: i,
          available: false,
          minor: false,
          major: false
        };

        // Defnes if the current year should be displayed as a major
        // or a minor subdivison
        if ((i % 50) === 0) {
          year.major = true;

        } else if ((i % 10) === 0) {
          year.minor = true;
        }

        $scope.years.push(year);
      }

      // Toggle the state of the component
      $scope.toggle = function() {
        $scope.isActive = !$scope.isActive;
      };

      /**
       * Update the list of years available
       */
      $scope.updateDatesAvailable = function() {
        var magnetizeCurrentYear = true;
        $scope.availableYears = [];
        for (var i = 0, length = $scope.years.length; i < length; i++) {
          var year = $scope.years[i];
          year.available = false;
          $scope.map.getLayers().forEach(function(olLayer, opt) {
            if (year.available) {
              return;
            }
            var timestamps = getLayerTimestamps(olLayer);
            if (timestamps) {
              for (var i = 0, length = timestamps.length; i < length; i++) {
                if (year.value === yearFromString(timestamps[i])) {
                  year.available = true;
                  $scope.availableYears.push(year);
                  if (year.value === $scope.currentYear) {
                    magnetizeCurrentYear = false;
                  }
                  break;
                }
              }
            }
          });
        }
        return magnetizeCurrentYear;
      };

      // Set the currentYear to the closest available year
      $scope.magnetize = function() {
        var minGap = null;
        for (var i = 0, length = $scope.availableYears.length; i < length;
            i++) {
          var elt = $scope.availableYears[i];
          var gap = elt.value - $scope.currentYear;
          minGap = (!minGap || (Math.abs(gap) < Math.abs(minGap))) ?
              gap : minGap;
        }

        if (minGap) {
          $scope.currentYear += minGap;
        }
      };

      /**
       * Update the layers with the new time parameter
       * @param {String} timeStr A year in string format.
       */
      $scope.updateLayers = function(timeStr) {
        // If time is:
        // undefined : Remove the use a parameter time
        // a string  : Apply the year selected

        $scope.map.getLayers().forEach(function(olLayer, opt) {
          var timestamps = getLayerTimestamps(olLayer);
          var id = olLayer.bodId;
          if (timestamps) {
            var layerTimeStr = timeStr;
            if (!angular.isDefined(layerTimeStr)) {
              var timeBehaviour = gaLayers.getLayerProperty(id,
                                                            'timeBehaviour');
              if (timeBehaviour === 'all') {
                layerTimeStr = '';
              } else { //most recent
                layerTimeStr = timestamps[0];
              }
            }
            var src = olLayer.getSource();
            if (src instanceof ol.source.WMTS) {
              var wmtsTS = timeStampFromYear(layerTimeStr, timestamps);
              src.updateDimensions({'Time' : wmtsTS});
            } else if (src instanceof ol.source.ImageWMS ||
                src instanceof ol.source.TileWMS) {
              src.updateParams({'TIME' : layerTimeStr});
            }
          }
        });
      };

      /** Utils **/
      var timeStampFromYear = function(yearStr, timestamps) {
        var ts;
        for (var i = 0, ii = timestamps.length; i < ii; i++) {
          ts = timestamps[i];
          //Strange if statement here because yearStr can either be
          //full timestamp string or year-only string...
          if (yearStr === ts ||
              parseInt(yearStr) === yearFromString(ts)) {
            return ts;
          }
        }
        return undefined;
      };

      var yearFromString = function(timestamp) {
        return parseInt(timestamp.substr(0, 4));
      };

      var getLayerTimestamps = function(olLayer) {
        var id = olLayer.bodId;
        var timestamps;
        if (id && gaLayers.getLayer(id) &&
            gaLayers.getLayerProperty(id, 'timeEnabled')) {
          timestamps = gaLayers.getLayerProperty(id, 'timestamps');
        }
        return timestamps;
      };
    }
  );

  module.directive('gaTimeSelectorBt', function($rootScope, gaPermalink,
      $translate) {
    return {
      restrict: 'A',
      template: '<a href="#" ng-click="toggle($event)" ng-class="stateClass">' +
          '</a>',
      link: function(scope, elt, attrs) {

        // Enable the button if it is disable
        var enable = function() {
          if (scope.isDisable) {
            scope.stateClass = 'enabled';
            scope.isDisable = false;
            elt.tooltip('destroy');
            elt.tooltip({
              placement: 'left',
              title: function() {
                return $translate('time_bt_enabled_tooltip');
              }
            });
          }
        };

        // Disable the button in any case
        var disable = function() {
          scope.stateClass = '';
          scope.isDisable = true;
          scope.isActive = false;
          elt.tooltip('destroy');
          elt.tooltip({
            placement: 'left',
            title: function() {
               return $translate('time_bt_disabled_tooltip');
            }
          });
        };

        // Events to force the state of the component from another directive
        $rootScope.$on('gaTimeSelectorEnabled', enable);
        $rootScope.$on('gaTimeSelectorDisabled', disable);

        // Toggle the state of the component between active and enable
        scope.toggle = function(event) {
          if (!scope.isDisable) {
            scope.isActive = !scope.isActive;
            scope.stateClass = scope.isActive ? 'active' : 'enabled';
            $rootScope.$broadcast('gaTimeSelectorToggle', scope.isActive);
          }

          // Avoid the add of # at the end of the url
          if (event) {
            event.preventDefault();
          }
        };

        // Initially the button is always disable, then if a parameter exists in
        // the permalink we enable the button then we active the slider.
        disable();
        if (angular.isDefined(gaPermalink.getParams().time)) {
          enable();
          scope.toggle();
        }
      }
    };
  });

  module.directive('gaTimeSelector',
    function($rootScope, gaBrowserSniffer, gaPermalink, gaLayers, gaDebounce,
        gaLayerFilters) {
      return {
        restrict: 'A',
        templateUrl: function(element, attrs) {
          return 'components/timeselector/partials/timeselector.' +
              ((gaBrowserSniffer.mobile) ? 'select.html' : 'html');
        },
        scope: {
          map: '=gaTimeSelectorMap',
          options: '=gaTimeSelectorOptions'
        },
        controller: 'GaTimeSelectorDirectiveController',
        link: function(scope, elt, attrs, controller) {
          /**
           * Refresh the list of available date and the currentYear on each
           * changes in the layers list.
           */
          var refreshComp = function(olLayers) {
            // We update the list of dates available then
            // we magnetize the current year value
            // to the closest available year if needed
            if (scope.updateDatesAvailable()) {
              scope.magnetize();
            }

            // If there is one or more timeEnabled layer
            // we broadcast event to inform other directives that the slider
            // can be activate or not
            if (olLayers.length == 0 && !fromPermalink) {
              $rootScope.$broadcast('gaTimeSelectorDisabled');
            } else {
              $rootScope.$broadcast('gaTimeSelectorEnabled');
            }
          };

          scope.layers = scope.map.getLayers().getArray();
          scope.layerFilter = gaLayerFilters.timeEnabledLayersFilter;
          scope.$watchCollection('layers | filter:layerFilter', refreshComp);

          // Activate/deactivate manually the time selector
          $rootScope.$on('gaTimeSelectorToggle', function(event, active) {
            scope.isActive = active;
          });

          // Watchers
          scope.$watch('isActive', function(active) {
            if (angular.isDefined(active)) {
              scope.stateClass = (active) ? 'active' : '';
              applyNewYear((active ? scope.currentYear : undefined));
            }
          });

          scope.$watch('currentYear', function(year) {
            if (scope.isActive) {
              applyNewYearDebounced(year);
            }
          });

          /** Utils **/

          /**
           * Apply the year selected
           */
          var applyNewYear = function(year) {
            var newYear = transformYearToTimeStr(year);

            // Only valid values are allowed: undefined, null or
            // minYear <= newYear <= maxYear
            if ((!newYear ||
               (scope.minYear <= newYear && newYear <= scope.maxYear))) {
              scope.updateLayers(newYear);
              if (newYear === undefined) {
                gaPermalink.deleteParam('time');
              } else {
                gaPermalink.updateParams({time: newYear});
              }
              $rootScope.$broadcast('gaTimeSelectorChange', newYear);
            }
          };
          var applyNewYearDebounced = gaDebounce.debounce(applyNewYear, 200,
              false);

          /**
           * Tranform a year given by the select box or the slider component
           * into a time parameter usable by layers
           */
          var transformYearToTimeStr = function(year) {
            // The select box returns an object
            if (year && typeof year === 'object') {
              year = '' + year.value;
            }
            return year;
          };

          // Initialize the state of the component
          var permalinkValue = parseFloat(gaPermalink.getParams().time);
          var fromPermalink = !isNaN(permalinkValue);
          scope.currentYear = (fromPermalink) ? permalinkValue : scope.maxYear;
          scope.isActive = fromPermalink;
        }
      };
    }
  );
})();
