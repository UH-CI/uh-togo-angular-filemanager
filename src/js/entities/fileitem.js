(function(window, angular, $) {
    "use strict";
    angular.module('FileManagerApp').factory('fileItem', ['$http', '$q', '$translate', '$localStorage', '$state', '$uibModal', '$rootScope', 'fileManagerConfig', 'AccessControlList', 'FilesController', 'FileManagementActionTypeEnum', 'PostitsController', 'TransformsController', 'Configuration', 'Upload',
        function($http, $q, $translate, $localStorage, $state, $uibModal, $rootScope,fileManagerConfig, AccessControlList, FilesController, FileManagementActionTypeEnum, PostitsController, TransformsController, Configuration, Upload) {

        var FileItem = function(model, path, system) {
            var rawModel = {
                name: model && model.name || '',
                path: path || [],
                type: model && model.type || 'file',
                uuid: model && model.uuid,
                size: model && parseInt(model.length || 0),
                date: model && model.lastModified,
                perms: this.agaveFilePermission(model && model.permissions),
                content: model && model.content || '',
                recursive: false,
                sizeKb: function() {
                    return Math.round(this.size / 1024, 1);
                },
                fullPath: function() {
                    if (this.path.length == 1 && this.path[0] === '/'){
                        return ('/' + this.name).replace(/\/\//g, '/');
                    }
                        return ('/' + this.path.join('/') + '/' + this.name).replace(/\/\//g, '/');
                },
                fullPathNoFile: function() {
                    if (this.path.length == 1 && this.path[0] === '/'){
                        return ('/');
                    }
                    else {
                        return ('/' + this.path.join('/')).replace(/\/\//g, '/');
                    }
                },
                crumbsPath: function(){
                    //There's the possiblitiy that this does extra replaces.
                    //TODO: Use regular expressions or return this path from the server.
                    var fullPath = this.fullPath().split('/');
                    return fullPath;
                },
                _links: model && model._links,
                system: system
            };

            this.error = '';
            this.inprocess = false;
            this.postit = {};

            this.model = angular.copy(rawModel);
            this.tempModel = angular.copy(rawModel);

            function parseMySQLDate(mysqlDate) {
                var d = (mysqlDate || '').toString().split(/[- :]/);
                return new Date(d[0], d[1] - 1, d[2], d[3], d[4], d[5]);
            }
        };

        // ACLs
         FileItem.prototype.getRwxObj = function() {
            return {
                  read: false,
                  write: false,
                  execute: false,
                  recursive: false,
            };
        };

        FileItem.prototype.transformRwxToAgave = function(rwxObj) {
          var result = '';
          if (rwxObj.read === true && rwxObj.write === true && rwxObj.execute === true){
            result = 'ALL';
          }
          else if (rwxObj.read === true && rwxObj.write === false && rwxObj.execute === false){
            result = 'READ';
          }
          else if (rwxObj.read === false && rwxObj.write === true && rwxObj.execute === false) {
            result = 'WRITE';
          }
          else if (rwxObj.read === false && rwxObj.write === false && rwxObj.execute === true) {
            result = 'EXECUTE';
          }
          else if (rwxObj.read === true && rwxObj.write === true && rwxObj.execute === false) {
            result = 'READ_WRITE';
          }
          else if (rwxObj.read === true && rwxObj.write === false && rwxObj.execute === true) {
            result = 'READ_EXECUTE';
          }
          else if (rwxObj.read === false && rwxObj.write === true && rwxObj.execute === true) {
            result = 'WRITE_EXECUTE';
          }
          else {
            result = 'NONE';
          }
          return result;
        };

        FileItem.prototype.transformAgaveToRwx = function(agavePermission) {
            var rwxObj = this.getRwxObj();

            switch(agavePermission){
                case "ALL":
                    rwxObj.read = true;
                    rwxObj.write = true;
                    rwxObj.execute = true;
                  break;
                case "READ":
                    rwxObj.read = true;
                  break;
                case "WRITE":
                    rwxObj.write = true;
                  break;
                case "EXECUTE":
                    rwxObj.execute = true;
                  break;
                case "READ_WRITE":
                    rwxObj.read = true;
                    rwxObj.write = true;
                  break;
                case "READ_EXECUTE":
                    rwxObj.read = true;
                    rwxObj.execute = true;
                  break;
                case "WRITE_EXECUTE":
                    rwxObj.write = true;
                    rwxObj.execute = true;
                  break;
                case "EXECUTE":
                    rwxObj.execute = true;
                  break;
            }

            return rwxObj;
        };

        FileItem.prototype.changePermissions = function() {
          var self = this;
          var deferred = $q.defer();

          var newPem = new FilePermissionRequest();
          newPem.setUsername(self.tempModel.username);
          newPem.setPermission(self.tempModel.perms);
          newPem.setRecursive(self.tempModel.type === 'file' && self.tempModel.perms.recursive);

          self.inprocess = true;
          self.error = '';
          FilesController.updateFileItemPermission(newPem, this.model.system.id, self.tempModel.fullPath())
              .then(function(data) {
                  self.deferredHandler(data, deferred);
              }, function(data) {
                  self.deferredHandler(data, deferred, $translate.instant('error_changing_perms'));
              })['finally'](function() {
                  self.inprocess = false;
              });
          return deferred.promise;
        };

        // permissions for single user
        FileItem.prototype.agaveFilePermission = function (agavePermission) {
          var pems = {};
          var username = $localStorage.activeProfile.username;
          pems[username] = this.transformAgaveToRwx(agavePermission);
          return pems;
        };

        // permissions for all group/users
       FileItem.prototype.agaveFilePermissions = function (agavePermission, username) {
          var self = this;
          self.inprocess = true;
          var deferred = $q.defer();

          FilesController.listFileItemPermissions(self.model.system.id, 99999, 0, self.model.fullPath())
            .then(function(data){
              angular.forEach(data, function(pem) {
                self.model.perms[pem.username] = pem.permission;
                self.model.recursive = pem.recursive;
                self.tempModel.recursive = pem.recursive;
                self.model.perms[pem.username].recursive = pem.recursive;
                self.tempModel.perms[pem.username] = angular.copy(self.model.perms[pem.username]);
              });
              self.inprocess = false;
            })
            .catch(function(data){
              self.deferredHandler(data, deferred, $translate.instant('error_changing_perms'));
              self.inprocess = false;
            })
        };

        FileItem.prototype.changePermission = function(pem, username){
          var self = this;
          var deferred = $q.defer();
          var newPem = new FilePermissionRequest();

          newPem.setUsername(username);
          newPem.setPermission(self.transformRwxToAgave(pem));
          newPem.setRecursive(self.tempModel.type === 'file' && pem.recursive);

          self.inprocess = true;
          self.error = '';

          var path = self.model.path.join('/') + '/' + self.model.name;

          return FilesController.updateFileItemPermission(newPem, this.model.system.id, path )
              .then(
                function(data) {
              }, function(data) {
              });
        };

        FileItem.prototype.changePermissions = function() {
          var self = this;
          var promises = [];

          angular.forEach(self.tempModel.perms, function(pem, username){
            if (JSON.stringify(self.model.perms[username]) !== JSON.stringify(self.tempModel.perms[username])) {
              promises.push(self.changePermission(pem, username));
            }
          });

          var deferred = $q.defer();

          return $q.all(promises)
            .then(
              function(data) {
                deferred.resolve(data);
              },
              function(data){
                deferred.reject(data);
            }
          );
        };

        FileItem.prototype.notifications = function () {
          var self = this;
          self.inprocess = true;
          var deferred = $q.defer();
          FilesController.listFileItems(self.model.system.id, self.model.fullPath(), 1, 0)
            .then(
              function(response){
                if (response.length === 0){
                  $state.go(
                    'notifications-manager',{associatedUuid: '', resourceType: 'file'}
                  );
                } else {
                  var buffer = response[0]._links.metadata.href.split('associationIds%22%3A%22')[1];
                  var uuid = buffer.split('%22%7D')[0];
                  $state.go(
                    'notifications-manager',{associatedUuid: uuid, resourceType: 'file'}
                  );
                }
                self.inprocess = false;
              }
            ).catch(function(response){
              self.deferredHandler(response, deferred, $translate.instant('error_notifications_files'));
              self.inprocess = false;
            });
        };

        FileItem.prototype.update = function() {
            angular.extend(this.model, angular.copy(this.tempModel));
        };

        FileItem.prototype.revert = function() {
            angular.extend(this.tempModel, angular.copy(this.model));
            this.error = '';
        };

        FileItem.prototype.deferredHandler = function(data, deferred, defaultMsg) {
            if (!data || typeof data !== 'object') {
                this.error = 'Bad response from the server, please check the docs';
            }
            if (data.result && data.result.error) {
                this.error = data.result.error;
            }
            if (!this.error && data.error) {
                this.error = data.error.message;
            }
            if (!this.error && defaultMsg) {
                this.error = defaultMsg;
            }
            if (this.error) {
                return deferred.reject(data);
            }
            this.update();
            return deferred.resolve(data);
        };

        FileItem.prototype.createFolder = function() {
            var self = this;
            var deferred = $q.defer();

            var action = new FileMkdirAction();
            action.setPath(self.tempModel.name);

            self.inprocess = true;
            self.error = '';
            FilesController.updateInvokeFileItemAction(action, self.tempModel.system.id, self.tempModel.path.join('/'))
                .then(function(data) {
                    self.deferredHandler(data, deferred);
                }, function(data) {
                    self.deferredHandler(data, deferred, $translate.instant('error_creating_folder'));
                })['finally'](function(data) {
                    self.inprocess = false;
                });

            return deferred.promise;
        };

        FileItem.prototype.rename = function() {
            var self = this;
            var deferred = $q.defer();

            var action = new FileRenameAction();
            action.setPath(self.tempModel.name);

            self.inprocess = true;
            self.error = '';

            FilesController.updateInvokeFileItemAction(action, self.model.system.id, self.model.fullPath())
                .then(function(data) {
                    self.deferredHandler(data, deferred);
                }, function(data) {
                    self.deferredHandler(data, deferred, $translate.instant('error_renaming'));
                })['finally'](function(data) {
                    self.inprocess = false;
                });

            return deferred.promise;
        };

        FileItem.prototype.copy = function() {
          var self = this;
          var deferred = $q.defer();
          var action = new FileCopyAction();

          self.inprocess = true;
          self.error = '';

          // add system to path if copying to another system
          if (self.model.system.id !== self.tempModel.system.id){
            var urlToIngest = $localStorage.tenant.baseUrl + 'files/v2/media/system/' + self.model.system.id + self.model.fullPath();

            FilesController.importFileItem(urlToIngest, self.tempModel.fullPath(), self.tempModel.system.id)
              .then(
                function(response){
                  self.deferredHandler(response, deferred);
                },
                function(response){
                  var message = '';
                  if (response.errorMessage) {
                    message = $translate.instant('error_copying') + ' - ' + response.errorMessage
                  } else if (response.errorResponse.fault){
                    message = $translate.instant('error_copying') + ' - ' + response.errorResponse.fault.message;
                  } else {
                    message = $translate.instant('error_copying') ;
                  }
                  self.deferredHandler(response, deferred, message);
                })['finally'](function(response) {
                  self.inprocess = false;
                });
          } else {
            action.setPath(self.tempModel.fullPath());

            FilesController.updateInvokeFileItemAction(action, self.model.system.id, self.model.fullPath())
              .then(
                function(response) {
                  self.deferredHandler(response, deferred);
                },
                function(response) {
                  var message = '';
                  if (response.errorMessage) {
                    message = $translate.instant('error_copying') + ' - ' + response.errorMessage
                  } else if (response.errorResponse.fault){
                    message = $translate.instant('error_copying') + ' - ' + response.errorResponse.fault.message;
                  } else {
                    message = $translate.instant('error_copying') ;
                  }
                  self.deferredHandler(response, deferred, message);
                })['finally'](function(data) {
                  self.inprocess = false;
                });
          }

          return deferred.promise;
        };

        FileItem.prototype.move = function() {
          var self = this;
          var deferred = $q.defer();
          var action = new FileMoveAction();

          self.inprocess = true;
          self.error = '';

          // add system to path if copying to another system
          if (self.model.system.id !== self.tempModel.system.id){
            var urlToIngest = $localStorage.tenant.baseUrl + 'files/v2/media/system/' + self.model.system.id + self.model.fullPath();

            FilesController.importFileItem(urlToIngest, self.tempModel.fullPath(), self.tempModel.system.id)
              .then(
                function(response){
                  self.deferredHandler(response, deferred);
                },
                function(response){
                  var message = '';
                  if (response.errorMessage) {
                    message = $translate.instant('error_moving') + ' - ' + response.errorMessage
                  } else if (response.errorResponse.fault){
                    message = $translate.instant('error_moving') + ' - ' + response.errorResponse.fault.message;
                  } else {
                    message = $translate.instant('error_moving') ;
                  }
                  self.deferredHandler(response, deferred, message);
                })['finally'](function(response) {
                  self.inprocess = false;
                });
          } else {
            action.setPath(self.tempModel.fullPath());

            FilesController.updateInvokeFileItemAction(action, self.model.system.id, self.model.fullPath())
              .then(
                function(response) {
                  self.deferredHandler(response, deferred);
                },
                function(response) {
                  var message = '';
                  if (response.errorMessage) {
                    message = $translate.instant('error_moving') + ' - ' + response.errorMessage
                  } else if (response.errorResponse.fault){
                    message = $translate.instant('error_moving') + ' - ' + response.errorResponse.fault.message;
                  } else {
                    message = $translate.instant('error_moving') ;
                  }
                  self.deferredHandler(response, deferred, message);
                })['finally'](function(data) {
                  self.inprocess = false;
                });
          }

          return deferred.promise;
        };

        FileItem.prototype.compress = function() {
            var self = this;
            var deferred = $q.defer();

            self.inprocess = true;
            self.error = '';

            // perform an unpacking of the compressed file/folder
            var transformRequest = new TransformRequest();
            transformRequest.setNativeFormat('zip-0');
            transformRequest.setUrl(self.tempModel._links.self.href);

            TransformsController.createSyncTransform(transformRequest, ProfilesController.me.username, self.model.fullPath())
                .then(function(data) {
                    self.deferredHandler(data, deferred);
                }, function(data) {
                    self.deferredHandler(data, deferred, $translate.instant('error_compressing'));
                })["finally"](function() {
                    self.inprocess = false;
                });

            return deferred.promise;
        };

        FileItem.prototype.extract = function() {
            var self = this;
            var deferred = $q.defer();

            self.inprocess = true;
            self.error = '';

            // perform an unpacking of the compressed file/folder
            var transformRequest = new TransformRequest();
            transformRequest.setNativeFormat('RAW-0');
            transformRequest.setUrl(self.tempModel._links.self.href);

            TransformsController.createSyncTransform(transformRequest, ProfilesController.me.username, self.model.fullPath())
                .then(function(data) {
                    self.deferredHandler(data, deferred);
                }, function(data) {
                    self.deferredHandler(data, deferred, $translate.instant('error_extracting'));
                })["finally"](function() {
                    self.inprocess = false;
                });
            return deferred.promise;
        };

        FileItem.prototype.download = function(preview) {
            var self = this;
            var deferred = $q.defer();

            self.inprocess = true;
            self.error = '';

            if (preview === true){
              if (self.tempModel.preview){
                self.tempModel.preview = {};
              }

              if (self.isImage()){
                var data = {
                    force: "true"
                };

                var postitIt = new PostItRequest();
                postitIt.setMaxUses(2);
                postitIt.setMethod("GET");
                postitIt.setUrl([decodeURIComponent(self.model._links.self.href), $.param(data)].join('?'));

                PostitsController.addPostit(postitIt)
                    .then(function(data) {
                      self.tempModel.preview = {};
                      self.tempModel.preview.isImage = true;
                      self.tempModel.preview.url = data._links.self.href;
                      self.tempModel.preview.isPreviewable = self.isPreviewable();
                      self.deferredHandler(data, deferred);
                    }, function(data){
                      self.deferredHandler(data, deferred, $translate.instant('error_getting_content'));
                    })['finally'](function() {
                      self.inprocess = false;
                    });
              } else {
                var filePath = $localStorage.tenant.baseUrl + 'files/v2/media/system/' + self.model.system.id + self.model.fullPath();

                $http({
                     method: 'GET',
                     url: filePath,
                     responseType: 'arraybuffer',
                     cache: false,
                     headers: {
                       'Authorization': 'Bearer ' + $localStorage.token.access_token
                     }
                 }).success(function(data){
                   self.tempModel.preview = {};
                   if (self.isPdf()){
                     self.tempModel.preview.isPdf = true;
                     self.tempModel.preview.data = URL.createObjectURL(new Blob([data], {type: 'application/pdf'}));
                   } else {
                     self.tempModel.preview.isText = true;
                     self.tempModel.preview.data = URL.createObjectURL(new Blob([data]));
                   }
                   self.tempModel.preview.isPreviewable = self.isPreviewable();
                   self.inprocess = false;
                   self.deferredHandler(data, deferred, data.message);
                 }).error(function(data){
                   self.deferredHandler(data, deferred, $translate.instant('error_getting_content'));
                   self.inprocess = false;
                 });
              }
            } else {
              var data = {
                  force: "true"
              };

              var postitIt = new PostItRequest();
              postitIt.setMaxUses(2);
              postitIt.setMethod("GET");
              postitIt.setUrl([decodeURIComponent(self.model._links.self.href), $.param(data)].join('?'));

              PostitsController.addPostit(postitIt)
                  .then(function(data) {
                      if (self && self.model.type !== 'dir') {
                        if (typeof self.tempModel.preview === 'undefined'){
                          self.tempModel.preview = {};
                        }
                        self.tempModel.preview.isPdf = self.isPdf();
                        self.tempModel.preview.isImage = self.isImage();
                        self.tempModel.preview.isText = self.isText();

                        var link = document.createElement('a');
                        link.setAttribute('download', null);
                        link.setAttribute('href', data._links.self.href);
                        link.style.display = 'none';

                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                      self.deferredHandler(data, deferred);
                  }, function(data){
                      self.deferredHandler(data, deferred, $translate.instant('error_getting_content'));
                  })['finally'](function() {
                    self.inprocess = false;
                  });
            }

            return deferred.promise;
        };

        FileItem.prototype.createPostit = function(timeOption){
          var self = this;
          var deferred = $q.defer();

          if (typeof self.postit !== 'undefined'){
            var postitIt = new PostItRequest();
            postitIt.setMaxUses(self.postit.maxUses);
            postitIt.setMethod("GET");
            postitIt.setUrl(decodeURIComponent(self.model._links.self.href));

            if (typeof self.postit.lifetime === 'undefined') {
              self.postit.lifetime = 2592000; // set to default 30 days
            }

            if (typeof timeOption === 'undefined'){
              timeOption = '';
            }

            switch(timeOption){
              case 'minutes': postitIt.setLifetime(self.postit.lifetime * 60);
                break;
              case 'hours': postitIt.setLifetime(self.postit.lifetime * 3600);
                break;
              case 'days': postitIt.setLifetime(self.postit.lifetime * 86400)
                break;
              default:
                postitIt.setLifetime(self.postit.lifetime);
            }

            PostitsController.addPostit(postitIt)
              .then(
                function(data) {
                  self.postit.link = data._links.self.href;

                  self.deferredHandler(data, deferred);
              },
              function(data){
                  self.deferredHandler(data, deferred, $translate.instant('error_getting_content'));
              });

          }
          return deferred.promise;
        }

        FileItem.prototype.preview = function() {
            var self = this;
            var deferred = $q.defer();

            self.download(true)
              .then(
                function(data){
                  self.deferredHandler(data, deferred);
                },
                function(data){
                  self.deferredHandler(data, deferred, $translate.instant('error_displaying'));
                });

            return  deferred.promise;
        };

         FileItem.prototype.getContent = function() {
            var self = this;
            var deferred = $q.defer();

            self.inprocess = true;
            self.error = '';
            FilesController.getDownloadFileItem(self.tempModel.fullPath(), self.model.system.id, false)
                .then(function(data) {
                    if (typeof self.tempModel.preview === 'undefined'){
                      self.tempModel.preview = {};
                    }
                    if (angular.isObject(data)) {
                        self.tempModel.content = self.model.content = JSON.stringify(data, null, 2);
                    } else {
                        self.tempModel.content = self.model.content = data;
                    }

                    self.tempModel.preview.isEdit = true;
                    self.deferredHandler({ result: self.tempModel.content }, deferred);
                }, function(data) {
                    self.deferredHandler(data, deferred, $translate.instant('error_getting_content'));
                })['finally'](function() {
                    self.inprocess = false;
                });

            return deferred.promise;
        };

        FileItem.prototype.remove = function() {
            var self = this;
            var deferred = $q.defer();


            self.inprocess = true;
            self.error = '';
            FilesController.deleteFileItem(self.tempModel.fullPath(), self.model.system.id)
                .then(function(data) {
                    self.deferredHandler({ result: data ? data: 'Successfully removed object'}, deferred);
                }, function(data) {
                    self.deferredHandler(data, deferred, $translate.instant('error_deleting'));
                })['finally'](function() {
                    self.inprocess = false;
                });

            return deferred.promise;
        };

        FileItem.prototype.editSave = function() {
            var self = this;
            var deferred = $q.defer();
            self.inprocess = true;

            var filePath = Configuration.BASEURI + 'files/v2/media/system/' + self.tempModel.system.id + '/' + self.tempModel.path.join('/') + "?naked=true";
            var blob = new Blob([self.tempModel.content], {type: "text/plain"})
            var file = new File([blob], self.tempModel.name, {type: "text/plain"});

            Upload.upload({
                url: filePath,
                // data: formData,
                data: {
                  file: file,
                  fileToUpload: file,
                  append: false,
                  fileType: 'raw'
                },
                method: 'POST',
                headers: {
                  "Content-Type": undefined,
                  "Authorization": "Bearer " + Configuration.oAuthAccessToken
                }
            }).then(
              function (data) {
                self.deferredHandler(data, deferred);
            }, function (data) {
                self.deferredHandler(data, deferred, $translate.instant('error_saving'));
            })['finally'](function (data) {
                self.inprocess = false;
            });
            return deferred.promise;

        };

        FileItem.prototype.fetchPermissions = function() {
            var self = this;
            var deferred = $q.defer();

            self.inprocess = true;
            self.error = '';
            FilesController.listFileItemPermissions(this.model.system.id, 99999, 0, self.tempModel.fullPath())
                .then(function(data) {
                    self.deferredHandler(data, deferred);
                }, function(data) {
                    self.deferredHandler(data, deferred, $translate.instant('error_changing_perms'));
                })['finally'](function() {
                self.inprocess = false;
            });

            return deferred.promise;
        };

        FileItem.prototype.isFolder = function() {
            return this.model.type === 'dir';
        };

        FileItem.prototype.currentUserIsAdmin = function() {
          var adminList = ["jgeis","seanbc","mduman","cshuler"];
          var result = adminList.includes($localStorage.activeProfile.username);
          return result;
       };

        FileItem.prototype.isPreviewable = function() {
           return !this.isFolder() && fileManagerConfig.isPreviewableFilePattern.test(this.model.name);
        };


        FileItem.prototype.isEditable = function() {
            return !this.isFolder() && fileManagerConfig.isEditableFilePattern.test(this.model.name);
        };

        FileItem.prototype.isImage = function() {
            return fileManagerConfig.isImageFilePattern.test(this.model.name);
        };

        FileItem.prototype.isCompressible = function() {
            return this.isFolder();
        };

        FileItem.prototype.isExtractable = function() {
            return !this.isFolder() && fileManagerConfig.isExtractableFilePattern.test(this.model.name);
        };

        FileItem.prototype.isPdf = function(){
            return !this.isFolder() && fileManagerConfig.isPdfFilePattern.test(this.model.name);
        };

        FileItem.prototype.isText = function(){
            return !this.isFolder() && fileManagerConfig.isTextFilePattern.test(this.model.name);
        };

        FileItem.prototype.editPermissions = function(resource){
            var modalInstance = $uibModal.open({
              templateUrl: '/bower_components/angular-filebrowser/src/templates/permissions.html',
              scope: $rootScope,
              resolve:{
                  resource: function() {
                    return resource;
                  },
              },
              controller: ['$scope', '$modalInstance', 'resource',
                function($scope, $modalInstance, resource){
                  $scope.resource = resource;

                  $scope.getRwxObj = function() {
                      return {
                            read: false,
                            write: false,
                            execute: false
                      };
                  };

                  $scope.transformRwxToAgave = function(rwxObj) {
                    var result = '';
                    if (rwxObj.read === true && rwxObj.write === true && rwxObj.execute === true){
                      result = 'ALL';
                    }
                    else if (rwxObj.read === true && (rwxObj.write === false || typeof rwxObj.write === 'undefined') && (rwxObj.execute === false || typeof rwxObj.execute === 'undefined')){
                      result = 'READ';
                    }
                    else if ((rwxObj.read === false || typeof rwxObj.read === 'undefined') && rwxObj.write === true && (rwxObj.execute === false || typeof rwxObj.execute === 'undefined')) {
                      result = 'WRITE';
                    }
                    else if ((rwxObj.read === false || typeof rwxObj.read === 'undefined') && (rwxObj.write === false || typeof rwxObj.write === 'undefined') && rwxObj.execute === true) {
                      result = 'EXECUTE';
                    }
                    else if (rwxObj.read === true && rwxObj.write === true && (rwxObj.execute === false || typeof rwxObj.execute === 'undefined')) {
                      result = 'READ_WRITE';
                    }
                    else if (rwxObj.read === true && (rwxObj.write === false || typeof rwxObj.write === 'undefined') && rwxObj.execute === true) {
                      result = 'READ_EXECUTE';
                    }
                    else if ((rwxObj.read === false || rwxObj.read === 'undefined') && rwxObj.write === true && rwxObj.execute === true) {
                      result = 'WRITE_EXECUTE';
                    }
                    else {
                      result = 'NONE';
                    }
                    return result;
                  };

                  $scope.transformAgaveToRwx = function(agavePermission) {
                    var rwxObj = $scope.getRwxObj();

                    switch(agavePermission){
                        case "ALL":
                            rwxObj.read = true;
                            rwxObj.write = true;
                            rwxObj.execute = true;
                          break;
                        case "READ":
                            rwxObj.read = true;
                          break;
                        case "WRITE":
                            rwxObj.write = true;
                          break;
                        case "EXECUTE":
                            rwxObj.execute = true;
                          break;
                        case "READ_WRITE":
                            rwxObj.read = true;
                            rwxObj.write = true;
                          break;
                        case "READ_EXECUTE":
                            rwxObj.read = true;
                            rwxObj.execute = true;
                          break;
                        case "WRITE_EXECUTE":
                            rwxObj.write = true;
                            rwxObj.execute = true;
                          break;
                        case "EXECUTE":
                            rwxObj.execute = true;
                          break;
                    }

                    return rwxObj;
                  };

                  $scope.refresh = function() {
                    $scope.requesting = true;
                    FilesController.listFileItemPermissions($scope.resource.tempModel.system.id, 99999, 0, $scope.resource.tempModel.fullPath()).then(
                      function(response) {
                          $scope.model = {};
                          $scope.tempModel = {};

                          $scope.schema =
                          {
                            "type": "object",
                            "title": "Complex Key Support",
                            "properties": {
                              "name": {
                                "type": "string",
                                "title": "Name"
                              },
                              "permissions": {
                                "title": "permissions by username",
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "properties": {
                                    "username": {
                                      "title": " ",
                                      "type": "string"
                                    },
                                    "permission": {
                                      "title": " ",
                                      "type": "string",
                                      "enum": [
                                        "ALL",
                                        "READ",
                                        "WRITE",
                                        "EXECUTE",
                                        "READ_WRITE",
                                        "READ_EXECUTE",
                                        "WRITE_EXECUTE",
                                        "NONE"
                                      ]
                                    }
                                  },
                                }
                              },
                            }
                          };

                          $scope.form = [
                            {
                              "key": "permissions",
                              "items": [
                                {
                                  "type": "fieldset",
                                  "items": [
                                      {
                                        "type": "section",
                                        "htmlClass": "col-xs-6",
                                        "items": [
                                            {
                                              "key": "permissions[].username"
                                            }
                                        ],

                                      },
                                      {
                                        "type": "section",
                                        "htmlClass": "col-xs-6",
                                        "items": ["permissions[].permission"]
                                      }
                                  ]
                                }
                              ]
                            }
                          ];

                          var tempList = [];
                          $scope.tempModel.permissions = [];

                          angular.forEach(response, function(permission){
                            tempList.push({username: permission.username, permission:  $scope.transformRwxToAgave(permission.permission)});
                          });

                          // remove double listing of permissions for admin app owners
                          var uniqueTempList = _.uniq(tempList, function(permission){
                            return permission.username;
                          });
                          $scope.tempModel.permissions = angular.copy(uniqueTempList);

                          $scope.model.permissions = _.clone($scope.tempModel.permissions);
                          $scope.requesting = false;
                        },
                        function(response) {
                            $scope.requesting = false;
                            $modalInstance.dismiss('cancel');

                            // TO-DO: this is invasive, need to remove togo and provide filemanager messages
                            App.alert({message: $translate.instant('error_files_permissions_update')});
                        });
                  };

                  $scope.clearpermissions = function() {
                      $scope.model = {};
                      $scope.tempModel = {};
                  };


                  $scope.savePermissionChanges = function(){
                    var deletedpermissions = _.difference($scope.model.permissions, $scope.resource.tempModel.permissions);
                    $scope.requesting = true;
                    var promises = [];

                    // Take care of deleted permissions first
                    angular.forEach(deletedpermissions, function(permission){
                      promises.push(
                        // updateFileItemPermission: function (body, systemId, path)
                        // deleteClearFileItemPermissions: function (systemId, path)
                        FilesController.deleteClearFileItemPermissions($scope.resource.tempModel.system.id, $scope.resource.tempModel.fullPath())
                      );
                    });

                    angular.forEach($scope.tempModel.permissions, function(permission){
                      promises.push(
                        FilesController.updateFileItemPermission(permission, $scope.resource.tempModel.system.id, $scope.resource.tempModel.fullPath())
                      );
                    });

                    $q.all(promises).then(
                      function(response) {
                          // TO-DO: this is invasive, need to remove togo and provide filemanager messages
                          App.alert({message: $translate.instant('success_files_permissions_update')});
                          $scope.requesting = false;
                          $modalInstance.close();
                      },
                      function(response) {
                          // TO-DO: this is invasive, need to remove togo and provide filemanager messages
                          App.alert({message: $translate.instant('error_files_permissions_update')});
                          $scope.requesting = false;
                          $modalInstance.close();
                      });
                  };

                  $scope.cancel = function()
                  {
                      $modalInstance.dismiss('cancel');
                  };

                  $scope.refresh();
              }]

            });
        };

        return FileItem;
    }]);
})(window, angular, jQuery);
