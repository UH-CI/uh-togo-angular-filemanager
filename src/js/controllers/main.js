(function(window, angular, $) {
    "use strict";
    angular.module('FileManagerApp').controller('FileManagerCtrl', [
    '$scope', '$state', '$rootScope', '$translate', '$cookies', '$filter', '$ocLazyLoad', 'fileManagerConfig', 'fileItem', 'fileNavigator', 'fileUploader','Commons', 'SystemsController',
        function($scope, $state, $rootScope, $translate, $cookies, $filter, $ocLazyLoad, fileManagerConfig, fileItem, FileNavigator, FileUploader, Commons, SystemsController) {
        $scope.config = fileManagerConfig;
        $scope.appName = fileManagerConfig.appName;
        $scope.modes = ['Javascript', 'Shell', 'XML', 'Markdown', 'CLike', 'Python'];
        $scope.cmMode = '';

        $scope.cmOptions = {
            lineWrapping: true,
            lineNumbers: true,
            matchBrackets: true,
            styleActiveLine: false,
            theme: "solarized",
            mode: 'shell',
            onLoad: function (_cm) {

                // HACK to have the codemirror instance in the scope...
                $scope.modeChanged = function () {
                    $scope.cmMode = this.cmMode;
                    _cm.setOption("mode", $scope.cmMode.toLowerCase());

                    // lazy load the plugin for the necessary mode support
                    $ocLazyLoad.load([
                        '/bower_components/codemirror/mode/' + $scope.cmMode + "/" + $scope.cmMode + '.js'
                    ]);
                };
            }
        };


        $scope.reverse = false;
        $scope.predicate = ['model.type', 'model.name'];
        $scope.order = function(predicate) {
            $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
            $scope.predicate[1] = predicate;
        };

        $scope.system = '';
        $scope.path = '';
        $scope.query = '';
        $scope.temp = new fileItem(null, null, $scope.system);
        $scope.fileNavigator = new FileNavigator($scope.system, $scope.path);
        $scope.fileUploader = FileUploader;
        $scope.uploadFileList = [];
        $scope.viewTemplate = $cookies.viewTemplate || 'main-table.html';

        $scope.setTemplate = function(name) {
            $scope.viewTemplate = $cookies.viewTemplate = name;
        };

        $scope.changeLanguage = function (locale) {
            if (locale) {
                return $translate.use($cookies.language = locale);
            }
            $translate.use($cookies.language || fileManagerConfig.defaultLang);
        };

        $scope.touch = function(item) {
            item = item instanceof fileItem ? item : new fileItem(null, null, $scope.system);
            item.revert && item.revert();
            $scope.temp = item;
        };

        $scope.smartClick = function(item) {
            if (item.isFolder()) {
                return $scope.fileNavigator.folderClick(item);
            }

            if ($scope.config.allowedActions.agaveUpload === true){
              if (item.isImage()) {
                  // TO-DO: handle error message
              }
              $scope.fileNavigator.requesting = true;
              item.getContent().then(
                function(response){
                  $rootScope.uploadFileContent = response.result;
                  $scope.fileNavigator.requesting = false;
                },
                function(response) {
                  var errorMsg = response.result && response.result.error || $translate.instant('error_uploading_files');
                  $scope.temp.error = errorMsg;
              });
            } else if ($scope.config.allowedActions.agaveSelect === true){
                $rootScope.uploadFileContent = 'agave://' + item.model.system.id + item.model.fullPath();
            } else {
              item.preview();
              $scope.temp = item;
              return $scope.modal('preview');
            }
        };


        $scope.modal = function(id, hide) {
          //  $('#' + id).uibModal(hide ? 'hide' : 'show')
          hide ? $('#' + id).modal('hide') :  $('#' + id).modal('show');
        };

        $scope.isInThisPath = function(path) {
            var currentPath = $scope.fileNavigator.currentPath.join('/');
            return currentPath.indexOf(path) !== -1;
        };

        // TO-DO: make this work property with codemirror
        // $scope.edit = function(item){
        //   var self = item;
        //   item.getContent()
        //     .then(
        //       function(data){
        //         self.tempModel.preview.isText = false;
        //         $scope.temp = self;
        //         return $scope.modal('preview');
        //       },
        //       function(data){
        //       });
        // };

        $scope.editSave = function(item) {
            item.editSave().then(function() {
                $scope.modal('preview', true);
                $scope.fileNavigator.refresh();
            });
        };

        $scope.changePermissions = function(item) {
            item.changePermissions()
              .then(
                function(data) {
                  $scope.modal('changepermissions', true);
                }
            );
        };

        $scope.editPermissions = function(item){
          item.editPermissions(item);
        }

        // Populate systems in copy mod
        $scope.getCopySystems = function(){
          SystemsController.listSystems(99999).then(
            function (response) {
              $scope.copySystems = response.result;
            }
          );
        }

        // Populate systems in move mod
        $scope.getMoveSystems = function(){
          SystemsController.listSystems(99999).then(
            function (response) {
              $scope.moveSystems = response.result;
            }
          );
        }
        $scope.move = function(item){
          var samePath = item.tempModel.path.join() === item.model.path.join();
          if (samePath && $scope.fileNavigator.fileNameExists(item.tempModel.name)) {
              item.error = $translate.instant('error_invalid_filename');
              return false;
          }
          item.move().then(function() {
              $scope.fileNavigator.refresh();
              $scope.modal('move', true);
          });
        }

        $scope.copy = function(item) {
            var samePath = item.tempModel.path.join() === item.model.path.join();
            if (samePath && $scope.fileNavigator.fileNameExists(item.tempModel.name)) {
                item.error = $translate.instant('error_invalid_filename');
                return false;
            }
            item.copy().then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('copy', true);
            });
        };

        $scope.compress = function(item) {
            item.compress().then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.compressAsync) {
                    return $scope.modal('compress', true);
                }
                item.asyncSuccess = true;
            }, function() {
                item.asyncSuccess = false;
            });
        };

        $scope.extract = function(item) {
            item.extract().then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.extractAsync) {
                    return $scope.modal('extract', true);
                }
                item.asyncSuccess = true;
            }, function() {
                item.asyncSuccess = false;
            });
        };

        $scope.remove = function(item) {
            item.remove().then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('delete', true);
            });
        };

        $scope.getAssociationIds= function (url="::"){
           return decodeURIComponent(url).split(":")[2].replace(/['"]+/g, '').replace('}','');
        }

        $scope.metadata = function(item) {
            //don't do anything yet
            $scope.modal('metadata', true);
        };

        $scope.rename = function(item) {
            var samePath = item.tempModel.path.join() === item.model.path.join();
            if (samePath && $scope.fileNavigator.fileNameExists(item.tempModel.name)) {
                item.error = $translate.instant('error_invalid_filename');
                return false;
            }
            item.rename().then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('rename', true);
            });
        };

        // postits
        $scope.timeItem = '';
        $scope.timeItems = ['seconds', 'minutes', 'hours', 'days'];
        $scope.selectTime = function(time){
          $scope.timeItem = time;
        };
        $scope.createPostit = function(item){
          item.createPostit($scope.timeItem)
          .then(
            function(data){
            },
            function(data){
            });
        };
        
        $scope.emailPostit = function(item) {
        	window.open('mailto:?subject=Link&body=' + item.postit.link);
        };

        $scope.createFolder = function(item) {
            var name = item.tempModel.name && item.tempModel.name.trim();
            item.tempModel.type = 'dir';
            item.tempModel.path = $scope.fileNavigator.currentPath;
            if (name && !$scope.fileNavigator.fileNameExists(name)) {
                item.createFolder().then(function() {
                    $scope.fileNavigator.refresh();
                    $scope.modal('newfolder', true);
                });
            } else {
                $scope.temp.error = $translate.instant('error_invalid_filename');
                return false;
            }
        };

        $scope.addForUpload = function($files) {
           $scope.uploadFileList = $scope.uploadFileList.concat($files);
           $scope.modal('uploadfile');
        };

        $scope.removeFromUpload = function(index) {
           $scope.uploadFileList.splice(index, 1);
        };

        $scope.uploadFiles = function() {
            $scope.fileUploader.upload($scope.uploadFileList, $scope.system, $scope.fileNavigator.currentPath).then(function() {
                $scope.fileNavigator.refresh();
                $scope.uploadFileList = [];
                $scope.modal('uploadfile', true);
            }, function(data) {
                var errorMsg = data.result && data.result.error || $translate.instant('error_uploading_files');
                $scope.temp.error = errorMsg;
            });
        };

        $scope.checkAllFiles = function(checkAll){
          if (checkAll){
            $scope.fileNavigator.fileListSelected = $scope.fileNavigator.fileList.filter(function(file){
              if (file.model.type !== "dir"){
                return file;
              }
            });
          } else {
            $scope.fileNavigator.fileListSelected = [];
          }
        }

        $scope.download = function(item){
          item.download().then(
            function(data){
              $scope.modal('preview', true);
            },
            function(data){
              var errorMsg = data.result && data.result.error || $translate.instant('error_downloading_files');
              $scope.temp.error = errorMsg;
            });
        }

        $scope.downloadFiles = function(fileListSelected){
          $scope.fileUploader.downloadSelected(fileListSelected).then(function() {
              $scope.fileNavigator.refresh();
              $scope.modal('uploadfile', true);
          }, function(data) {
              var errorMsg = data.result && data.result.error || $translate.instant('error_downloading_files');
              $scope.temp.error = errorMsg;
          });
        }
        //extract the uuids from the selected files to pass to
        //the filemetadata multiple add controller
        $scope.metadataFiles = function(fileListSelected){
          var uuids = [];
          angular.forEach(fileListSelected, function(file){
            uuids.push(file.model.uuid)
          })
          $state.go("filemetadata-multipleadd",{'associationIds[]': uuids});
        }

        $scope.deleteFiles = function(fileListSelected){
          $scope.fileUploader.deleteSelected(fileListSelected).then(function() {
              $scope.fileNavigator.refresh();
              $scope.modal('uploadfile', true);
          }, function(data) {
              var errorMsg = data.result && data.result.error || $translate.instant('error_deleting_files');
              $scope.temp.error = errorMsg;
          });
        }

        $scope.getQueryParam = function(param) {
            var found;
            window.location.search.substr(1).split("&").forEach(function(item) {
                if (param ===  item.split("=")[0]) {
                    found = item.split("=")[1];
                    return false;
                }
            });
            return found;
        };

        $scope.selectItem = function(item){
          $rootScope.uploadFileContent = 'agave://' + item.model.system.id + item.model.fullPath();
        }

        $scope.changeLanguage($scope.getQueryParam('lang'));
        $scope.isWindows = $scope.getQueryParam('server') === 'Windows';

        if ($scope.$parent.$parent.system) {
            $scope.fileNavigator.refresh();
        }

        $rootScope.$on('af:directory-change', function(event, systemId, newPath) {
          if ($scope.config.allowedActions.agaveUpload === false && $scope.config.allowedActions.agaveSelect === false){
            if (newPath) {
                $scope.$parent.$parent.$state.transitionTo(
                    'data-explorer',
                    {systemId: systemId, path: newPath},
                    {location: true, inherit: true, relative: $scope.$parent.$parent.$state.$current, notify: false})
            }
          }
        });

        $scope.$watch('$parent.$parent.system', function(val) {
            $scope.system = val;
            $scope.fileNavigator = new FileNavigator($scope.system, $scope.$parent.$parent.path);
            $scope.fileNavigator.refresh();
        });
    }]);
})(window, angular, jQuery);
