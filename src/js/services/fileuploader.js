(function(window, angular) {
    "use strict";
    angular.module('FileManagerApp').service('fileUploader', ['$http', '$q', 'fileManagerConfig', 'Configuration', 'Upload', 'PostitsController', 'FilesController', 'MetaController', function ($http, $q, fileManagerConfig, Configuration, Upload, PostitsController, FilesController, MetaController) {

        function deferredHandler(data, deferred, errorMessage) {
            if (!data || typeof data !== 'object') {
                return deferred.reject('Bridge response error, please check the docs');
            }
            if (data.result && data.result.error) {
                return deferred.reject(data);
            }
            if (data.error) {
                return deferred.reject(data);
            }
            if (errorMessage) {
                return deferred.reject(errorMessage);
            }
            deferred.resolve(data);
        }

        this.files = [];

        this.moveFile = function(file, new_path, callback){
        //  var samePath = file.tempModel.path.join() === file.model.path.join();
        //  if (samePath && fileNavigator.fileNameExists(file.tempModel.name)) {
        //      item.error = $translate.instant('error_invalid_filename');
        //      return false;
        //    }
          file.tempModel.path = new_path.split('/');
          return file.move().then(function(resp) {
              return callback(resp.data);
          });

        }

        this.moveSelected = function(fileListSelected, new_path){
          var self = this;
          var promises = [];

          angular.forEach(fileListSelected, function(file){
            promises.push(
              self.moveFile(file, new_path, function(value){
                self.files.push(value);
              })
            );
          });

          var deferred = $q.defer();

          return $q.all(promises).then(
            function(data) {
              deferredHandler(data, deferred, 'Files Moved Successfully');
            },
            function(data) {
              deferredHandler(data, deferred, 'error_moving_files');
          });

        }

        this.uploadFile = function(file, form, filesUri, callback) {

          var self = this;
          if(file.path != undefined){
            var filepath = file.path.split('/')
          }
          else{
            var filepath = []
          }
          filepath.pop();
          return Upload.upload({
              url: filesUri + '/' + filepath.join('/') + "?naked=true",
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
          }).then(function (resp) {
              return callback(resp.data);
          }, function (resp) {
          }, function (evt) {
              file.progress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total));
          });
        }

        this.requesting = false;

        this.makeFolders = function(fileList, system, path){
          var promises = [];
          var self = this;
          var foldersUri = Configuration.BASEURI + 'files/v2/media/system/' + system.id + '/'+"/?naked=true&action=mkdir";
          //create directories first
          angular.forEach(fileList, function (fileObj, key) {
            self.requesting = true;
//Calling curl -sk -H "Authorization: Bearer a369f6618593c29770dc861bed7554" -X PUT -d "action=mkdir&path=_seanbc/testfolder3/anewfolder/myfolder2" 'https://agaveauth.its.hawaii.edu/files/v2/media/system/ikewai-working-sean//?pretty=true'

            if (fileObj.type == 'directory'){
              var body = {};
              body.action = 'mkdir'
              body.path = fileObj.path;
              promises.push(
                FilesController.updateInvokeFileItemAction(body, system.id, path.join('/'))
                    .then(function(data) {
                        //self.deferredHandler(data, deferred);
                    }, function(data) {
                        //self.deferredHandler(data, deferred, $translate.instant('error_creating_folder'));
                    })
                //self.createFolder(fileObj, foldersUri, path, function(value){
                //})
              )
            }
          })

          var deferred = $q.defer();

          return $q.all(promises).then(
            function(data) {
              deferredHandler(data, deferred);
              return true;
            },
            function(data) {
              deferredHandler(data, deferred, $translate.instant('error_uploading_directory'));
              return false;
          })
          return true;
        }


        this.upload = function(fileList, system, path) {
          if (! window.FormData) {
            throw new Error('Unsupported browser version');
          }
          var self = this;

          var promises = [];
          var totalUploaded = 0;
          return self.makeFolders(fileList, system, path)
            .then(function(response){
              angular.forEach(fileList, function (fileObj, key) {
                if(fileObj.type != 'directory'){
                  var form = new window.FormData();

                  if (fileObj instanceof window.File) {
                    form.append('fileToUpload', fileObj);
                    form.append('append', false);
                    form.append('fileType', 'raw');
                  }

                  self.requesting = true;

                  var filesUri = Configuration.BASEURI + 'files/v2/media/system/' + system.id + '/' + path.join('/');

                  promises.push(
                    self.uploadFile(fileObj, form, filesUri, function(value){
                      self.files.push(value);
                    })
                  );
                }
              });

              var deferred = $q.defer();

              return $q.all(promises).then(
                function(data) {
                  deferredHandler(data, deferred);
                },
                function(data) {
                  deferredHandler(data, deferred, $translate.instant('error_uploading_files'));
              })
              ['finally'](function (data) {
                self.requesting = false;
              });
           })
        };

        this.stageFile = function(uuids, callback){
         MetaController.getMetadata('484964208339784166-242ac1110-0001-012')
           .then(function(response){
               var metadatum = response.result;
               var body = {};
               body.associationIds = metadatum.associationIds;
               //check if fileUuids are already associated to be stagged
               angular.forEach(uuids, function(uuid){
                 if (body.associationIds.indexOf(uuid) < 0) {
                   body.associationIds.push(uuid);
                 }
               })
                 body.name = metadatum.name;
                 body.value = metadatum.value;
                 body.schemaId = metadatum.schemaId;
                 body.rejected = metadatum.rejected;
                 //if uuid was rejected before remove it
                /* if (body.rejected != undefined){
                   angular.forEach(body.rejected, function(rejected_uuid){
                     if (body.associationIds.indexOf(rejected uuid) < 0) {
                       body.associationIds.push(rejected_uuid);
                     }
                   })
                 }*/
                 return   MetaController.updateMetadata(body,'484964208339784166-242ac1110-0001-012')
                  .then(function(resp) {
                   return callback(resp.data);
                  });
             })
         };

        this.stageForRepo = function(fileUuids){
         var self = this;
         var promises = [];
         //create promise for adding association to staging metadata record
         promises.push(
           self.stageFile(fileUuids, function(value){
             //self.files.push(value); //not doing anything with this at the moment
           })
         )

         var deferred = $q.defer();

         return $q.all(promises).then(
           function(data) {
             deferredHandler(data, deferred);
           },
           function(data) {
             deferredHandler(data, deferred, $translate.instant('error_stagging_files'));
         });
        };

        this.download = function(file, callback) {
            var data = {
                force: "true"
            };

            var postitIt = new PostItRequest();
            postitIt.setMaxUses(2);
            postitIt.setMethod("GET");
            postitIt.setUrl([file.model._links.self.href, $.param(data)].join('?'));

            return PostitsController.addPostit(postitIt)
                .then(function(resp) {
                    if (file.model.type !== 'dir') {
                      var link = document.createElement('a');
                      link.setAttribute('download', null);
                      link.setAttribute('href', resp._links.self.href);
                      link.style.display = 'none';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                    return callback(resp.data);
                });
        };

        this.downloadSelected = function(fileListSelected){
          var self = this;
          var promises = [];

          angular.forEach(fileListSelected, function(file){
            promises.push(
              self.download(file, function(value){
                self.files.push(value);
              })
            );
          });

          var deferred = $q.defer();

          return $q.all(promises).then(
            function(data) {
              deferredHandler(data, deferred);
            },
            function(data) {
              deferredHandler(data, deferred, $translate.instant('error_dowwnloading_files'));
          });
        };

        this.delete = function(file, callback) {
            if (file.model.path && file.model.name){
              var path = file.model.path.join('/') + '/' + file.model.name;
              var systemId = file.model.system.id;
              return FilesController.deleteFileItem(path, systemId)
                .then(
                  function(resp){
                    return callback(resp.data);
                  }
                );
            }
        };

        this.deleteSelected = function(fileListSelected){
          var self = this;
          var promises = [];

          angular.forEach(fileListSelected, function(file){
            promises.push(
              self.delete(file, function(value){
                self.files.push(value);
              })
            );
          });

          var deferred = $q.defer();

          return $q.all(promises).then(
            function(data) {
              deferredHandler(data, deferred);
            },
            function(data) {
              deferredHandler(data, deferred, 'Error deleting files');
          });
        };

    }]);
})(window, angular);
