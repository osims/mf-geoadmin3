(function() {
  goog.provide('ga_tooltip_controller');

  var module = angular.module('ga_tooltip_controller', []);

  module.controller('GaTooltipController',
      ['$scope', 'gaGlobalOptions',
      function($scope, gaGlobalOptions) {

        var baseUrl = function() {
            return gaGlobalOptions.serviceUrl + '/rest/services';

        };

        $scope.options = {
          tolerance: 5,
          identifyUrlTemplate: baseUrl() + '/{Topic}/MapServer/identify',
          htmlUrlTemplate: baseUrl() + '/{Topic}/MapServer/{Layer}/{Feature}/htmlpopup'
        };
      }
  ]);
})();
