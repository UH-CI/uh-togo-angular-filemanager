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

        this.uploadFile = function(file, form, filesUri, callback) {
          var self = this;

          return Upload.upload({
              url: filesUri,
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

        this.upload = function(fileList, system, path) {
          if (! window.FormData) {
            throw new Error('Unsupported browser version');
          }
          var self = this;

          var promises = [];
          var totalUploaded = 0;

          angular.forEach(fileList, function (fileObj, key) {

            var form = new window.FormData();

            if (fileObj instanceof window.File) {
              form.append('fileToUpload', fileObj);
              form.append('append', false);
              form.append('fileType', 'raw');
            }

            self.requesting = true;

            var filesUri = Configuration.BASEURI + 'files/v2/media/system/' + system.id + '/' + path.join('/') + "?naked=true";

            promises.push(
              self.uploadFile(fileObj, form, filesUri, function(value){
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
              deferredHandler(data, deferred, $translate.instant('error_uploading_files'));
          })
          ['finally'](function (data) {
            self.requesting = false;
          });
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
