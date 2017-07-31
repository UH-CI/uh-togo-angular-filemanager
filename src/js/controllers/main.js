(function(window, angular, $) {
    "use strict";
    angular.module('FileManagerApp').controller('FileManagerCtrl', [
    '$scope', '$state', '$rootScope', '$translate', '$cookies', '$filter', '$ocLazyLoad', 'fileManagerConfig', 'fileItem', 'fileNavigator', 'fileUploader','Commons', 'FilesController', 'SystemsController','MetaController',
        function($scope, $state, $rootScope, $translate, $cookies, $filter, $ocLazyLoad, fileManagerConfig, fileItem, FileNavigator, FileUploader, Commons, FilesController, SystemsController,MetaController) {
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

        $scope.get_staged_uuids = function(){
          MetaController.listMetadata("{'name':{'$in':['stagged','staged']}}")
            .then(function(response){
              $scope.staged_uuids =  response.result[0].associationIds;
            })
        }

        $scope.get_published_uuids = function(){
          MetaController.listMetadata("{'name':'published'}")
            .then(function(response){
              $scope.published_uuids =  response.result[0].associationIds;
            })
        }

        $scope.get_rejected_uuids = function(){
          MetaController.listMetadata("{'name':'rejected'}")
            .then(function(response){
              $scope.rejected_uuids =  response.result[0].associationIds;
            })
        }

        $scope.get_staged_uuids();
        $scope.get_published_uuids();
        $scope.get_rejected_uuids();

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
            $scope.temp.postit.lifetime = 30; // pre-set the values on the postits modal
            $scope.temp.postit.maxUses = 1;   // pre-set the values on the postits modal
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
          //set current and new path to fileNavigator currentPath
          angular.element('#currentpath').val($scope.fileNavigator.currentPath.join('/'))
          angular.element('#groupfilepath').val($scope.fileNavigator.currentPath.join('/'))
        }
        $scope.move = function(item){
          // checking to see if the file already exists in the new location
          // calling to get the metadata for the new file/location, if I get something back
          // it means a file already exists there.  If get an error, then
          // the way is clear.  So I WANT to get an error message, if I don't get an error,
          // tell the user a file with the same name already exists in that location.
            var origFullPath = item.model.path.join('/') + "/" + item.model.name;
            var newFullPath = item.tempModel.path.join('/') + "/" + item.tempModel.name;
            if (item.isFolder() && newFullPath.startsWith(origFullPath)) {
            	item.error = $translate.instant('error_cant_nest_folder_in_itself');
            }
            else {
		        FilesController.listFileItems(item.tempModel.system.id, newFullPath, 999999, 0)
		            .then(function(response){
		              if (item.isFolder()) {
		            	item.error = $translate.instant('error_folder_exists');
		              }
		              else {
		            	item.error = $translate.instant('error_file_exists');
		              }
		              return false;
		        }, function (response) {
		        	  var canMove = true;
		        	  // warn the user that any attached metadata in any file in a moved folder will be lost
		        	  /*if (item.isFolder()) {
		        		  canMove = confirm($translate.instant('move_confirm_metadata_loss'));
		        	  }*/
		        	  if (canMove) {
		        		  item.move().then(function() {
		        			  $scope.fileNavigator.refresh();
		        			  $scope.modal('move', true);
			          	  });
		        	  }
		        });
            }
        };

        $scope.copy = function(item) {
            // checking to see if the file already exists in the new location
            // calling to get the metadata for the new file/location, if I get something back
            // it means a file already exists there.  If get an error, then
            // the way is clear.  So I WANT to get an error message, if I don't get an error,
            // tell the user a file with the same name already exists in that location.
            var origFullPath = item.model.path.join('/') + "/" + item.model.name;
            var newFullPath = item.tempModel.path.join('/') + "/" + item.tempModel.name;
            // it works if you try to copy a folder into itself, but gives a weird error message, for now, don't allow
            if (item.isFolder() && newFullPath.startsWith(origFullPath)) {
            	item.error = $translate.instant('error_cant_nest_folder_in_itself');
            }
  	        FilesController.listFileItems(item.tempModel.system.id, newFullPath, 999999, 0)
  	            .then(function(response){
	                if (item.isFolder()) {
		              item.error = $translate.instant('error_folder_exists');
		            }
		            else {
		              item.error = $translate.instant('error_file_exists');
		            }
  	            	return false;
            }, function (response) {
              var canMove=true;
	        	  // warn the user that metadata is not included in the copy
	            //  var canMove = confirm($translate.instant('copy_confirm_metadata_loss'));
	        	  if (canMove) {
	            	item.copy().then(function() {
	            		$scope.fileNavigator.refresh();
	            		$scope.modal('copy', true);
	            	});
	        	  }
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

        // start of postits
        $scope.timeItem = 'days';
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
        // end of postits

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
              $scope.modal('preview', true);
          }, function(data) {
              var errorMsg = data.result && data.result.error || $translate.instant('error_downloading_files');
              $scope.temp.error = errorMsg;
          });
        }
        //extract the uuids from the selected files to pass to
        //the filemetadata multiple add controller
        $scope.metadataFiles = function(fileListSelected){
          var uuids = [];
          var paths =[]
          angular.forEach(fileListSelected, function(file){
            uuids.push(file.model.uuid)
            paths.push(file.model.fullPath())
          })
          $state.go("filemetadata-multipleadd",{'fileUuids': uuids,'filePaths':paths});
        }
        $scope.stageFilesForRepo = function(fileListSelected){
          var uuids = [];
          angular.forEach(fileListSelected, function(file){
            uuids.push(file.model.uuid)
          })
          $scope.fileUploader.stageForRepo(uuids).then(function(){
            $state.reload();
            $translate.instant('success_files_staged');
          })
          //metadata id to add file uuid to asscotionIds to 484964208339784166-242ac1110-0001-012
        }

        $scope.deleteFiles = function(fileListSelected){
          $scope.fileUploader.deleteSelected(fileListSelected).then(function() {
              $scope.fileNavigator.refresh();
              $scope.modal('group-delete-files', true);
          }, function(data) {
              var errorMsg = data.result && data.result.error || $translate.instant('error_deleting_files');
              $scope.temp.error = errorMsg;
          });
        }

        $scope.groupfilesmove = function(fileListSelected){
          angular.element('#movefilebutton').prop("disabled", true);
          $scope.requesting = true;
          var new_path = angular.element('#groupfilepath').val();
          $scope.fileUploader.moveSelected(fileListSelected, new_path).then(function() {
              $scope.requesting = true;
              $scope.fileNavigator.refresh();
              $scope.modal('groupfilesmove', true);
              $scope.fileNavigator.fileListSelected = [];
          }, function(data) {
              var errorMsg = data.result && data.result.error || $translate.instant('error_moving_files');
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
