test:core:load:refuses-a-bad-path () {

    @errors 'Invalid module name' core:load:use 'Core::Log'
    @errors 'Invalid module name' core:load:use 'core/log'
    @errors 'Invalid module name' core:load:use '::core'
    @errors 'Nothing to use as core::nothing' core:load:use core::nothing
    core:load:resolve core
    @eq "${LOAD_PATH}" core/index.sh
    core:load:resolve core/log
    @eq "${LOAD_PATH}" core/log.sh
    core:load:resolve module/gate
    @eq "${LOAD_PATH}" module/gate/index.sh

}
test:core:load:lists-a-folder () {

    @contains "$(core:load:list core)" core/log.sh
    @absent "$(core:load:list core)" app/
    @errors 'Invalid source folder' core:load:list 'core/'

}
test:core:load:loads-once () {

    @use core::log
    @use module::gate
    @eq "${LOAD_STATE[core/log.sh]} ${LOAD_STATE[module/gate/index.sh]}" 'loaded loaded'

}
