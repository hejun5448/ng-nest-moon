import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ObjectID, getManager } from 'typeorm';
import { RepositoryService } from '../../common/services/repository.service';
import { ResultList } from '../../common/interfaces/result.interface';
import { Page } from '../entities/page.entity';
import { Control } from '../entities/control.entity';
import * as _ from 'lodash';

export interface PageQuery {
    name?: string;
    moduleId?: string;
}

@Injectable()
export class PageService extends RepositoryService<Page> {

    constructor(
        @InjectRepository(Page)
        private readonly entityRepository: Repository<Page>,
        @InjectRepository(Control)
        private readonly controlRepository: Repository<Control>
    ) {
        super(entityRepository);
    }

    async findOne(id: string | number | Date | ObjectID): Promise<Page> {
        return await this.entityRepository.createQueryBuilder('page')
            .leftJoinAndSelect('page.controls', 'control')
            .where("page.id=:id", { id: id })
            .getOne();
    }

    async create(entity: Page): Promise<Page> {
        return await getManager().transaction<Page>(async x => {
            let result = await this.entityRepository.save(entity);
            if (entity.controls instanceof Array)
                entity.controls.forEach(async (y, index) => {
                    y.sort = index;
                    await this.controlRepository.save(y)
                });
            return result;
        })
    }

    async update(entity: Page): Promise<Page> {
        let find = await this.entityRepository.findOne(entity.id, { relations: ['controls'] });
        entity.controls.forEach((x, i) => { x.sort = i });
        if (find) {
            return await getManager().transaction(async x => {
                let removes = _.filter(find.controls, y => !_.find(entity.controls, z => y.id == z.id)) as Control[];
                let adds = _.filter(entity.controls, y => !_.find(find.controls, z => y.id == z.id)) as Control[];
                let updates = _.filter(find.controls, y => _.find(entity.controls, z => y.id == z.id)) as Control[];
                if (removes instanceof Array) await this.controlRepository.remove(removes);
                if (adds instanceof Array) adds.forEach(async y => await this.controlRepository.save(y));
                if (updates instanceof Array) updates.forEach(async y => {
                    await this.controlRepository.save(Object.assign(y, _.find(entity.controls, z => z.id == y.id)))
                })
                Object.assign(find, entity);
                let result = await this.entityRepository.save(find);
                return result
            })
        }
    }

    async findAll(index: number, size: number, query: PageQuery): Promise<ResultList<Page>> {
        return new Promise<ResultList<Page>>(async (x) => {
            let querys = this.entityRepository
                .createQueryBuilder('page')
                .leftJoin("page.module", "module")
            if (query.name) querys.andWhere("page.name like '%:name%'", { name: query.name })
            if (query.moduleId) querys.andWhere("module.id=:id", { id: query.moduleId })
            let result: ResultList<Page> = {
                list: await querys.skip(size * (index - 1)).take(size).getMany(),
                count: await querys.getCount(),
                query: {
                    index: index,
                    size: size
                }
            }
            x(result);
        })
    }

    async findByCode(moduleCode: string, pageCode: string): Promise<Page> {
        return this.entityRepository
            .createQueryBuilder('page')
            .leftJoinAndSelect('page.controls', 'control')
            .leftJoin("page.module", "module")
            .where("module.code=:moduleCode and page.code=:pageCode", {
                pageCode: pageCode,
                moduleCode: moduleCode
            })
            .getOne();
    }
}
