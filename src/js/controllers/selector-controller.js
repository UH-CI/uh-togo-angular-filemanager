(function(angular, $) {
    "use strict";
    angular.module('FileManagerApp').controller('ModalFileManagerCtrl', [
        '$scope', '$rootScope', 'fileNavigator',
        function($scope, $rootScope, FileNavigator) {

        $scope.reverse = false;
        $scope.predicate = ['model.type', 'model.name'];
        $scope.order = function(predicate) {
            $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
            $scope.predicate[1] = predicate;
        };

        $scope.fileNavigator = new FileNavigator();

        $rootScope.select = function(item, temp) {
        	$rootScope.selectNoHide(item, temp);
            $('#selector').modal('hide');
        };
        
        // used by $rootScope.select
        $rootScope.selectNoHide = function(item, temp) {
            if (item.model.root === true){
               temp.tempModel.path = item.model.path;
               angular.element('#groupfilepath').val("/"+item.model.path.join('/'));
            } else {
               temp.tempModel.path = item.model.fullPath().split('/');
               angular.element('#groupfilepath').val(item.model.fullPath());
            }
        };
        
        // triggered by 'use selected folder' in selector modal in modals.html file
        $rootScope.folderClickAndHide = function(temp) {    	
	        var item = $scope.fileNavigator.fileList[0];
	        $scope.fileNavigator.folderClick(item);
	        $rootScope.select(item, temp);
        };

        // triggered by the close button in the selector modal in modals.html file
        $rootScope.closeNavigator = function(temp) {    
        	$scope.fileNavigator.system = temp.model.system;
            $scope.fileNavigator.currentPath = temp.model.path.slice();
            $scope.fileNavigator.crumbsPath = temp.model.path.slice();
            $scope.fileNavigator.refresh();
            $('#selector').modal('hide');
        };
        
        $rootScope.openNavigator = function(item, system) {
          if (typeof system !== 'undefined'){
            $scope.fileNavigator.system = item.tempModel.system = system;
            $scope.fileNavigator.currentPath = [];
          } else {
            $scope.fileNavigator.system = item.model.system;
            $scope.fileNavigator.currentPath = item.model.path.slice();
            // make the breadcrumbs match the folder we are currently showing
            //$scope.fileNavigator.crumbsPath = item.model.crumbsPath().splice(1);
            $scope.fileNavigator.crumbsPath = $scope.fileNavigator.currentPath;
          }

          $scope.fileNavigator.refresh();
          $('#selector').modal('show');
        };

    }]);
})(angular, jQuery);
